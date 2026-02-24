import { Injectable, OnApplicationBootstrap, OnModuleDestroy, Logger } from '@nestjs/common';
import { DatabaseService } from '../config/database.service';
import { SettingsService } from '../settings/settings.service';
import { ScoresService } from './scores.service';

@Injectable()
export class ScoreQueueProcessor implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ScoreQueueProcessor.name);
  private processIntervalId: ReturnType<typeof setInterval> | null = null;
  private retryIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly db: DatabaseService,
    private readonly settings: SettingsService,
    private readonly scoresService: ScoresService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const all = await this.settings.getAll();
    const intervalSec = Math.max(1, parseInt(all.llm_assessment_interval_seconds || '5', 10));
    const intervalMs = intervalSec * 1000;
    this.processIntervalId = setInterval(() => {
      void this.processOne().catch((e) => this.logger.warn('processOne error', e));
    }, intervalMs);
    const retryIntervalSec = Math.max(1, parseInt(all.llm_assessment_retry_interval_seconds || '60', 10));
    const retryIntervalMs = retryIntervalSec * 1000;
    this.retryIntervalId = setInterval(() => {
      void this.retryFailed().catch((e) => this.logger.warn('retryFailed error', e));
    }, retryIntervalMs);
  }

  onModuleDestroy() {
    if (this.processIntervalId !== null) {
      clearInterval(this.processIntervalId);
      this.processIntervalId = null;
    }
    if (this.retryIntervalId !== null) {
      clearInterval(this.retryIntervalId);
      this.retryIntervalId = null;
    }
  }

  private async retryFailed() {
    const all = await this.settings.getAll();
    const sec = Math.max(0, parseInt(all.llm_assessment_retry_interval_seconds || '60', 10));
    const db = this.db.getDb();
    db.prepare(
      `UPDATE score_queue SET status = 'pending', processed_at = NULL, error_message = NULL
       WHERE status = 'failed' AND datetime(processed_at, '+' || ? || ' seconds') <= datetime('now')`,
    ).run(sec);
  }

  /** 将长时间处于 processing 的陈旧记录标为失败，便于重试，避免一直卡住。此处必须设为 failed，不能改为 done。 */
  private static readonly PROCESSING_STALE_MINUTES = 10;
  /** 处理超时时的错误提示；出现此错误时状态必须保持为 failed，不能改为已完成。 */
  static readonly PROCESSING_TIMEOUT_MESSAGE = `处理超时（超过 ${ScoreQueueProcessor.PROCESSING_STALE_MINUTES} 分钟未完成，可能服务曾中断）`;

  private async processOne(): Promise<void> {
    const db = this.db.getDb();
    const staleMinutes = ScoreQueueProcessor.PROCESSING_STALE_MINUTES;
    db.prepare(
      `UPDATE score_queue SET status = 'failed', processed_at = datetime('now'), error_message = ?
       WHERE status = 'processing' AND datetime(created_at, '+' || ? || ' minutes') < datetime('now')`,
    ).run(ScoreQueueProcessor.PROCESSING_TIMEOUT_MESSAGE, staleMinutes);

    const row = db.prepare('SELECT id, work_record_id FROM score_queue WHERE status = ? ORDER BY id LIMIT 1').get('pending') as
      | { id: number; work_record_id: number }
      | undefined;
    if (!row) return;

    db.prepare('UPDATE score_queue SET status = ? WHERE id = ?').run('processing', row.id);
    const now = new Date().toISOString();

    try {
      const work = db.prepare(
        `SELECT w.content, w.recorder_id, u.position_id, d.name AS department_name, p.name AS position_name, p.assessment_criteria AS position_criteria
         FROM work_records w
         JOIN users u ON w.recorder_id = u.id
         LEFT JOIN departments d ON u.department_id = d.id
         LEFT JOIN positions p ON u.position_id = p.id
         WHERE w.id = ?`,
      ).get(row.work_record_id) as
        | {
            content: string;
            recorder_id: number;
            position_id: number | null;
            department_name: string | null;
            position_name: string | null;
            position_criteria: string | null;
          }
        | undefined;
      if (!work) {
        db.prepare('UPDATE score_queue SET status = ?, processed_at = ?, error_message = ? WHERE id = ?').run('failed', now, 'Work record not found', row.id);
        return;
      }

      const criteriaMarkdown =
        work.position_id && work.position_criteria ? String(work.position_criteria).trim() : '';

      const allSettings = await this.settings.getAll();
      const apiUrl = allSettings.llm_api_url || process.env.LLM_API_URL;
      const apiKey = allSettings.llm_api_key || process.env.LLM_API_KEY;
      const model = allSettings.llm_model || process.env.LLM_MODEL || 'gpt-3.5-turbo';
      const temperature = Math.min(2, Math.max(0, parseFloat(allSettings.llm_temperature ?? '0') || 0));
      const topP = Math.min(1, Math.max(0, parseFloat(allSettings.llm_top_p ?? '1') || 1));
      let totalScore = 0;
      const scoreDetails: { item_name: string; score: number; comment: string }[] = [];

      // apiUrl、apiKey、考核标准缺一不可，否则视为考核失败并记录原因
      if (!apiUrl || !apiKey || criteriaMarkdown.length === 0) {
        const reasons: string[] = [];
        if (!apiUrl) reasons.push('未配置 LLM API 地址');
        if (!apiKey) reasons.push('未配置 API 密钥');
        if (criteriaMarkdown.length === 0) reasons.push('岗位无考核标准');
        const errorMessage = `无法进行 AI 考核：${reasons.join('、')}`;
        db.prepare('UPDATE score_queue SET status = ?, processed_at = ?, error_message = ? WHERE id = ?').run('failed', now, errorMessage, row.id);
        return;
      }

      const LLM_TIMEOUT_MS = 120000; // 2 分钟超时，避免一直卡在 processing
      try {
        const departmentLabel = work.department_name ? `部门：${work.department_name}` : '';
        const positionLabel = work.position_name ? `岗位：${work.position_name}` : '';
        const contextLines = [departmentLabel, positionLabel].filter(Boolean);
        const contextBlock = contextLines.length > 0 ? `【被考核人信息】\n${contextLines.join('\n')}\n\n` : '';
        const prompt = `你是一位工作考核评分员。请严格按照以下考核标准（Markdown 格式）对工作内容进行评分，为每项考核标准生成 0-100 分的分数和简短评语。

要求：仅依据考核标准中的条目逐项打分并写评语，不要添加标准以外的项目。只返回一个 JSON 数组，不要其他说明。
格式：[{"item_name":"考核项名称","score":分数,"comment":"简短评语"}]

${contextBlock}【考核标准】（Markdown）\n${criteriaMarkdown}

【工作内容】\n${work.content.slice(0, 3000)}`;

        const ac = new AbortController();
        const timeoutId = setTimeout(() => ac.abort(), LLM_TIMEOUT_MS);
        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model, temperature, top_p: topP, messages: [{ role: 'user', content: prompt }] }),
          signal: ac.signal,
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
          const bodyText = await res.text().catch(() => '');
          const errMsg = `LLM 接口返回异常: ${res.status} ${bodyText.slice(0, 200)}`;
          this.logger.warn(errMsg);
          db.prepare('UPDATE score_queue SET status = ?, processed_at = ?, error_message = ? WHERE id = ?').run('failed', now, errMsg, row.id);
          return;
        }

        const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const content = data.choices?.[0]?.message?.content ?? '';
        const match = content.match(/\[[\s\S]*\]/);
        if (match) {
          const arr = JSON.parse(match[0]) as { item_name: string; score: number; comment?: string }[];
          for (const c of arr) {
            scoreDetails.push({ item_name: c.item_name, score: Number(c.score) || 0, comment: c.comment ?? '' });
          }
          totalScore =
            scoreDetails.length > 0
              ? scoreDetails.reduce((s, d) => s + d.score, 0) / scoreDetails.length
              : 0;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const isAbort = e instanceof Error && e.name === 'AbortError';
        const errorMessage = isAbort ? `LLM 请求超时（${LLM_TIMEOUT_MS / 1000} 秒）` : `LLM 调用失败: ${msg}`;
        this.logger.warn('LLM call failed', e);
        db.prepare('UPDATE score_queue SET status = ?, processed_at = ?, error_message = ? WHERE id = ?').run('failed', now, errorMessage, row.id);
        return;
      }

      if (scoreDetails.length === 0 && criteriaMarkdown.length > 0) {
        scoreDetails.push({ item_name: '综合', score: 0, comment: '待人工复核' });
        totalScore = 0;
      }

      // 一条工作记录 AI 只能评分一次：若已存在则只更新队列状态，不重复写入
      const existingAi = db.prepare('SELECT 1 FROM score_records WHERE work_record_id = ? AND score_type = ?').get(row.work_record_id, 'ai');
      if (existingAi) {
        db.prepare('UPDATE score_queue SET status = ?, processed_at = ? WHERE id = ?').run('done', now, row.id);
        return;
      }

      // 将 AI 各项考评评语汇总写入 remark，过长时截断避免异常数据
      const remarkRaw =
        scoreDetails
          .map((d) => (d.comment ? `${d.item_name}：${d.comment}` : ''))
          .filter(Boolean)
          .join('；') || 'AI评分';
      const remark = remarkRaw.length > 4000 ? remarkRaw.slice(0, 3997) + '…' : remarkRaw;

      db.prepare(
        'INSERT INTO score_records (work_record_id, scorer_id, score_type, score_details, total_score, remark, scored_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(row.work_record_id, work.recorder_id, 'ai', JSON.stringify(scoreDetails), totalScore, remark, now);
      this.scoresService.markScoreDirty(row.work_record_id);
      db.prepare('UPDATE score_queue SET status = ?, processed_at = ? WHERE id = ?').run('done', now, row.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn('Process failed', e);
      db.prepare('UPDATE score_queue SET status = ?, processed_at = ?, error_message = ? WHERE id = ?').run('failed', now, msg, row.id);
    }
  }
}
