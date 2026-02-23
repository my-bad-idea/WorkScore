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

  private async refreshRun(): Promise<void> {
    const runStart = new Date().toISOString();
    const db = this.db.getDb();
    const all = await this.settings.getAll();
    const aiPct = Math.min(100, Math.max(0, parseInt(all.llm_assessment_weight_percent || '80', 10)));
    const aiRatio = aiPct / 100;

    let dirtyList: { user_id: number; year_month: string }[];
    const isEmpty = (db.prepare('SELECT 1 FROM user_monthly_rankings LIMIT 1').get() as { '1'?: number } | undefined) == null;
    if (isEmpty) {
      const rows = db.prepare(
        `SELECT DISTINCT w.recorder_id AS user_id, substr(w.record_date, 1, 7) AS year_month
         FROM work_records w
         INNER JOIN score_records s ON s.work_record_id = w.id`,
      ).all() as { user_id: number; year_month: string }[];
      dirtyList = rows;
    } else {
      const lastRefresh = all.ranking_last_refresh_at ?? '1970-01-01T00:00:00.000Z';
      dirtyList = db.prepare(
        'SELECT user_id, year_month FROM user_monthly_score_updates WHERE last_updated_at > ?',
      ).all(lastRefresh) as { user_id: number; year_month: string }[];
    }

    const upsertStmt = db.prepare(
      `INSERT INTO user_monthly_rankings (user_id, year_month, department_id, position_id, avg_score, record_count, score_sum, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, year_month) DO UPDATE SET
         department_id = excluded.department_id,
         position_id = excluded.position_id,
         avg_score = excluded.avg_score,
         record_count = excluded.record_count,
         score_sum = excluded.score_sum,
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

      const userRow = db.prepare('SELECT department_id, position_id FROM users WHERE id = ?').get(user_id) as { department_id: number; position_id: number | null } | undefined;
      if (!userRow) continue;

      const now = new Date().toISOString();
      if (recordCount === 0) {
        deleteStmt.run(user_id, year_month);
      } else {
        const avgScore = scoreSum / recordCount;
        upsertStmt.run(user_id, year_month, userRow.department_id, userRow.position_id, avgScore, recordCount, scoreSum, now);
      }
    }

    db.prepare(
      'INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)',
    ).run('ranking_last_refresh_at', runStart, runStart);
  }
}
