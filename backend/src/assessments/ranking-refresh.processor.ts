import { Injectable, OnApplicationBootstrap, OnModuleDestroy, Logger } from '@nestjs/common';
import { DatabaseService } from '../config/database.service';
import { SettingsService } from '../settings/settings.service';

/** 与 scores.service getSummary 一致：单条记录总成绩 = AI 一条 + 人工多条取平均后加权 */
function getRecordScore(rows: { total_score: number; score_type: string }[], aiRatio: number): number {
  if (rows.length === 0) return 0;
  const aiRow = rows.find((r) => r.score_type === 'ai');
  const manualRows = rows.filter((r) => r.score_type === 'manual');
  const manualAvg = manualRows.length > 0
    ? manualRows.reduce((s, r) => s + r.total_score, 0) / manualRows.length
    : undefined;
  if (aiRow && manualAvg != null) return aiRow.total_score * aiRatio + manualAvg * (1 - aiRatio);
  if (aiRow) return aiRow.total_score;
  if (manualAvg != null) return manualAvg;
  return 0;
}

@Injectable()
export class RankingRefreshProcessor implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(RankingRefreshProcessor.name);
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly db: DatabaseService,
    private readonly settings: SettingsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const all = await this.settings.getAll();
    const intervalSec = Math.max(5, parseInt(all.ranking_refresh_interval_seconds || '30', 10));
    const intervalMs = intervalSec * 1000;
    this.intervalId = setInterval(() => {
      void this.refreshRun().catch((e) => this.logger.warn('ranking refresh error', e));
    }, intervalMs);
  }

  onModuleDestroy() {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /** 工作计划完成度 AI 打分：按执行人统计，取该执行人该月的计划列表返回 0–100 分，失败或无计划返回 0 */
  private async computeWorkPlanScore(
    db: ReturnType<DatabaseService['getDb']>,
    all: Record<string, string>,
    userId: number,
    yearMonth: string,
  ): Promise<number> {
    const plans = db.prepare(
      `SELECT plan_content, status, planned_start_at, planned_end_at, actual_start_at, actual_end_at
       FROM work_plans WHERE executor_id = ? AND substr(COALESCE(actual_start_at, planned_start_at, created_at), 1, 7) = ?`,
    ).all(userId, yearMonth) as { plan_content: string; status: string; planned_start_at: string | null; planned_end_at: string | null; actual_start_at: string | null; actual_end_at: string | null }[];
    if (plans.length === 0) return 0;

    const apiUrl = all.llm_api_url || process.env.LLM_API_URL;
    const apiKey = all.llm_api_key || process.env.LLM_API_KEY;
    const model = all.llm_model || process.env.LLM_MODEL || 'gpt-3.5-turbo';
    const temperature = Math.min(2, Math.max(0, parseFloat(all.llm_temperature ?? '0') || 0));
    const topP = Math.min(1, Math.max(0, parseFloat(all.llm_top_p ?? '1') || 1));
    if (!apiUrl || !apiKey) return 0;

    const lines = plans.map((p, i) => {
      const planned = p.planned_start_at && p.planned_end_at ? `计划: ${p.planned_start_at} ~ ${p.planned_end_at}` : '';
      const actual = p.actual_start_at && p.actual_end_at ? `实际: ${p.actual_start_at} ~ ${p.actual_end_at}` : '';
      return `${i + 1}. 内容: ${(p.plan_content || '').slice(0, 200)} | 状态: ${p.status} | ${planned} | ${actual}`;
    });
    const prompt = `你是一位工作计划完成度评分员。根据以下某用户在某月的工作计划及执行情况，给出一个 0–100 的完成度总分（考虑计划内容、状态、是否按计划/实际时间完成等）。
仅返回一个 JSON 对象，不要其他说明。格式：{"score": 数字}

【当月工作计划】
${lines.join('\n')}`;

    const LLM_TIMEOUT_MS = 60000;
    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), LLM_TIMEOUT_MS);
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, temperature, top_p: topP, messages: [{ role: 'user', content: prompt }] }),
        signal: ac.signal,
      });
      clearTimeout(t);
      if (!res.ok) return 0;
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = data.choices?.[0]?.message?.content ?? '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return 0;
      const parsed = JSON.parse(jsonMatch[0]) as { score?: number };
      const score = typeof parsed?.score === 'number' ? Math.min(100, Math.max(0, parsed.score)) : 0;
      return score;
    } catch (e) {
      this.logger.warn('work plan score LLM error', e);
      return 0;
    }
  }

  private async refreshRun(): Promise<void> {
    const runStart = new Date().toISOString();
    const db = this.db.getDb();
    const all = await this.settings.getAll();
    const aiPct = Math.min(100, Math.max(0, parseInt(all.llm_assessment_weight_percent || '80', 10)));
    const aiRatio = aiPct / 100;
    const workPlanRatioPct = Math.min(100, Math.max(0, parseInt(all.work_plan_ratio_percent || '40', 10)));
    const workPlanRatio = workPlanRatioPct / 100;
    const weeklyReportRatio = 1 - workPlanRatio;

    let dirtyList: { user_id: number; year_month: string }[];
    const isEmpty = (db.prepare('SELECT 1 FROM user_monthly_rankings LIMIT 1').get() as { '1'?: number } | undefined) == null;
    if (isEmpty) {
      const fromRecords = db.prepare(
        `SELECT DISTINCT w.recorder_id AS user_id, substr(w.record_date, 1, 7) AS year_month
         FROM work_records w
         INNER JOIN score_records s ON s.work_record_id = w.id`,
      ).all() as { user_id: number; year_month: string }[];
      const fromPlans = db.prepare(
        `SELECT DISTINCT COALESCE(executor_id, user_id) AS user_id, substr(COALESCE(actual_start_at, planned_start_at, created_at), 1, 7) AS year_month
         FROM work_plans WHERE ((actual_start_at IS NOT NULL AND actual_start_at != '') OR (planned_start_at IS NOT NULL AND planned_start_at != '') OR (created_at IS NOT NULL AND created_at != '')) AND (executor_id IS NOT NULL OR user_id IS NOT NULL)`,
      ).all() as { user_id: number; year_month: string }[];
      const keySet = new Set<string>();
      for (const r of [...fromRecords, ...fromPlans]) {
        if (r.year_month && r.year_month.length >= 7) keySet.add(`${r.user_id}:${r.year_month}`);
      }
      dirtyList = Array.from(keySet).map((k) => {
        const [user_id, year_month] = k.split(':');
        return { user_id: Number(user_id), year_month };
      });
    } else {
      const lastRefresh = all.ranking_last_refresh_at ?? '1970-01-01T00:00:00.000Z';
      const raw = db.prepare(
        'SELECT user_id, year_month FROM user_monthly_score_updates WHERE last_updated_at > ?',
      ).all(lastRefresh) as { user_id: number; year_month: string }[];
      const keySet = new Set<string>();
      for (const r of raw) keySet.add(`${r.user_id}:${r.year_month}`);
      dirtyList = Array.from(keySet).map((k) => {
        const [user_id, year_month] = k.split(':');
        return { user_id: Number(user_id), year_month };
      });
    }

    const upsertStmt = db.prepare(
      `INSERT INTO user_monthly_rankings (user_id, year_month, department_id, position_id, avg_score, record_count, score_sum, work_plan_score, weekly_report_score, total_score, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, year_month) DO UPDATE SET
         department_id = excluded.department_id,
         position_id = excluded.position_id,
         avg_score = excluded.avg_score,
         record_count = excluded.record_count,
         score_sum = excluded.score_sum,
         work_plan_score = excluded.work_plan_score,
         weekly_report_score = excluded.weekly_report_score,
         total_score = excluded.total_score,
         updated_at = excluded.updated_at`,
    );
    const deleteStmt = db.prepare('DELETE FROM user_monthly_rankings WHERE user_id = ? AND year_month = ?');

    for (const { user_id, year_month } of dirtyList) {
      const workRecords = db.prepare(
        'SELECT id FROM work_records WHERE recorder_id = ? AND record_date LIKE ?',
      ).all(user_id, `${year_month}%`) as { id: number }[];

      let scoreSum = 0;
      let recordCount = 0;
      for (const wr of workRecords) {
        const rows = db.prepare('SELECT total_score, score_type FROM score_records WHERE work_record_id = ?').all(wr.id) as { total_score: number; score_type: string }[];
        scoreSum += getRecordScore(rows, aiRatio);
        recordCount += 1;
      }
      const weeklyReportScore = recordCount > 0 ? scoreSum / recordCount : 0;
      const workPlanScore = await this.computeWorkPlanScore(db, all, user_id, year_month);
      const totalScore = workPlanScore * workPlanRatio + weeklyReportScore * weeklyReportRatio;

      const userRow = db.prepare('SELECT department_id, position_id FROM users WHERE id = ?').get(user_id) as { department_id: number; position_id: number | null } | undefined;
      if (!userRow) continue;

      const now = new Date().toISOString();
      if (recordCount === 0 && workPlanScore === 0) {
        deleteStmt.run(user_id, year_month);
      } else {
        upsertStmt.run(
          user_id, year_month, userRow.department_id, userRow.position_id,
          totalScore, recordCount, scoreSum,
          workPlanScore, weeklyReportScore, totalScore,
          now,
        );
      }
    }

    db.prepare(
      'INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)',
    ).run('ranking_last_refresh_at', runStart, runStart);
  }
}
