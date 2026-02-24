import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../config/database.service';
import { validatePasswordStrength } from '../common/password.util';

/**
 * 系统设置（system_settings 表）。各配置键在代码中的使用位置：
 * - token_expire_hours：auth/auth.service.ts 登录时 JWT 过期时间（小时）
 * - llm_api_url, llm_api_key, llm_model, llm_temperature, llm_top_p：各 LLM 调用处（score-queue.processor、scores.service、ranking-refresh.processor）
 * - llm_assessment_interval_seconds：scores/score-queue.processor.ts 考核队列轮询间隔（秒），onModuleInit 读取，默认 5
 * - llm_assessment_retry_interval_seconds：scores/score-queue.processor.ts 失败任务重新入队的间隔（秒）
 * - llm_assessment_weight_percent：考核排名与总成绩中 AI 评分权重（0–100，默认 80）；assessments/assessments.service.ts、scores/scores.service.ts getSummary
 * - default_user_password：新增人员时未填写密码时使用的默认密码；users/users.service.ts create；默认值 Aa.123456
 */
@Injectable()
export class SettingsService {
  constructor(private readonly db: DatabaseService) {}

  async getAll(): Promise<Record<string, string>> {
    const rows = this.db.getDb().prepare('SELECT key, value FROM system_settings').all() as {
      key: string;
      value: string;
    }[];
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  get(key: string): string | undefined {
    const row = this.db.getDb().prepare('SELECT value FROM system_settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row?.value;
  }

  async update(body: Record<string, string>) {
    for (const [key, value] of Object.entries(body)) {
      if (key === 'default_user_password') validatePasswordStrength(value);
    }
    const now = new Date().toISOString();
    const db = this.db.getDb();
    const stmt = db.prepare(
      'INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)',
    );
    for (const [key, value] of Object.entries(body)) {
      stmt.run(key, value, now);
    }
    if ('llm_assessment_weight_percent' in body || 'work_plan_ratio_percent' in body) {
      // 标记所有已有月度排名需重算：按 (user_id, year_month, source_type) 插入或更新
      db.prepare(
        `INSERT INTO user_monthly_score_updates (user_id, year_month, source_type, last_updated_at)
         SELECT user_id, year_month, 'work_record', ? FROM user_monthly_rankings
         ON CONFLICT(user_id, year_month, source_type) DO UPDATE SET last_updated_at = excluded.last_updated_at`,
      ).run(now);
      db.prepare(
        `INSERT INTO user_monthly_score_updates (user_id, year_month, source_type, last_updated_at)
         SELECT user_id, year_month, 'work_plan', ? FROM user_monthly_rankings
         ON CONFLICT(user_id, year_month, source_type) DO UPDATE SET last_updated_at = excluded.last_updated_at`,
      ).run(now);
    }
    return this.getAll();
  }
}
