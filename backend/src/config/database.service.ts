import { Injectable, OnModuleInit } from '@nestjs/common';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'path';

@Injectable()
export class DatabaseService implements OnModuleInit {
  private db!: DatabaseSync;

  getDb(): DatabaseSync {
    return this.db;
  }

  onModuleInit() {
    const dbPath = process.env.DATABASE_PATH ?? join(process.cwd(), 'data.sqlite');
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.runMigrations();
  }

  private runMigrations() {
    const db = this.db;
    db.exec(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS departments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        created_at TEXT,
        updated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS positions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        department_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        assessment_criteria TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY (department_id) REFERENCES departments(id)
      );
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        real_name TEXT NOT NULL,
        department_id INTEGER NOT NULL,
        position_id INTEGER,
        is_admin INTEGER DEFAULT 0,
        role TEXT NOT NULL DEFAULT 'user',
        enabled INTEGER DEFAULT 1,
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY (department_id) REFERENCES departments(id),
        FOREIGN KEY (position_id) REFERENCES positions(id)
      );
      CREATE TABLE IF NOT EXISTS work_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        record_date TEXT NOT NULL,
        content TEXT NOT NULL,
        recorder_id INTEGER NOT NULL,
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY (recorder_id) REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS score_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        work_record_id INTEGER NOT NULL,
        scorer_id INTEGER NOT NULL,
        score_type TEXT NOT NULL,
        score_details TEXT NOT NULL,
        total_score REAL,
        remark TEXT,
        scored_at TEXT,
        FOREIGN KEY (work_record_id) REFERENCES work_records(id),
        FOREIGN KEY (scorer_id) REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS score_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        work_record_id INTEGER NOT NULL UNIQUE,
        status TEXT DEFAULT 'pending',
        created_at TEXT,
        processed_at TEXT,
        error_message TEXT,
        FOREIGN KEY (work_record_id) REFERENCES work_records(id)
      );
      CREATE TABLE IF NOT EXISTS user_monthly_rankings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        year_month TEXT NOT NULL,
        department_id INTEGER NOT NULL,
        position_id INTEGER,
        avg_score REAL NOT NULL DEFAULT 0,
        record_count INTEGER NOT NULL DEFAULT 0,
        score_sum REAL NOT NULL DEFAULT 0,
        updated_at TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS user_monthly_score_updates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        year_month TEXT NOT NULL,
        last_updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS work_plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        creator_id INTEGER NOT NULL,
        department_id INTEGER NOT NULL,
        executor_id INTEGER,
        system TEXT,
        module TEXT,
        plan_content TEXT NOT NULL,
        planned_start_at TEXT,
        planned_end_at TEXT,
        planned_duration_minutes INTEGER,
        actual_start_at TEXT,
        actual_end_at TEXT,
        actual_duration_minutes INTEGER,
        priority TEXT NOT NULL DEFAULT 'medium',
        status TEXT NOT NULL DEFAULT 'pending',
        remark TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (creator_id) REFERENCES users(id),
        FOREIGN KEY (department_id) REFERENCES departments(id),
        FOREIGN KEY (executor_id) REFERENCES users(id)
      );
    `);
    const indexStatements = [
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_work_records_daily_unique ON work_records(recorder_id, record_date) WHERE type = \'daily\'',
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_work_records_weekly_unique ON work_records(recorder_id, record_date) WHERE type = \'weekly\'',
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_score_records_ai_unique ON score_records(work_record_id) WHERE score_type = \'ai\'',
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_score_records_manual_user_unique ON score_records(work_record_id, scorer_id) WHERE score_type = \'manual\'',
      'CREATE INDEX IF NOT EXISTS idx_work_records_recorder_date ON work_records(recorder_id, record_date)',
      'CREATE INDEX IF NOT EXISTS idx_work_records_type ON work_records(type)',
      'CREATE INDEX IF NOT EXISTS idx_score_records_work ON score_records(work_record_id)',
      'CREATE INDEX IF NOT EXISTS idx_score_queue_status ON score_queue(status)',
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_umr_user_month ON user_monthly_rankings(user_id, year_month)',
      'CREATE INDEX IF NOT EXISTS idx_umr_yearmonth_dept ON user_monthly_rankings(year_month, department_id)',
      'CREATE INDEX IF NOT EXISTS idx_work_plans_user_status ON work_plans(user_id, status)',
      'CREATE INDEX IF NOT EXISTS idx_work_plans_department ON work_plans(department_id)',
      'CREATE INDEX IF NOT EXISTS idx_work_plans_executor ON work_plans(executor_id)',
      'CREATE INDEX IF NOT EXISTS idx_work_plans_creator ON work_plans(creator_id)',
    ];
    for (const sql of indexStatements) {
      db.exec(sql);
    }
    // 系统设置默认值（与系统设置页一致，不含 API Key）
    const now = new Date().toISOString();
    const defaultSettings: Record<string, string> = {
      token_expire_hours: '168',
      default_user_password: 'Aa.123456',
      llm_api_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      llm_model: 'qwen-plus',
      llm_temperature: '0',
      llm_top_p: '1',
      llm_assessment_interval_seconds: '5',
      llm_assessment_retry_interval_seconds: '60',
      llm_assessment_weight_percent: '80',
      work_plan_ratio_percent: '40',
    };
    const insertSetting = db.prepare(
      'INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)',
    );
    for (const [key, value] of Object.entries(defaultSettings)) {
      insertSetting.run(key, value, now);
    }
    // 迁移：原为每条记录仅一条人工评分，现改为每条记录可多人评分、每人仅一条
    db.exec('DROP INDEX IF EXISTS idx_score_records_work_type');
    // 迁移：为已有 users 表添加 role 列并回填
    const tableInfo = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
    const hasRole = tableInfo.some((c) => c.name === 'role');
    if (!hasRole) {
      db.exec(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'`);
      db.prepare(`UPDATE users SET role = 'system_admin' WHERE is_admin = 1`).run();
    }

    // 迁移：user_monthly_score_updates 增加 source_type，区分 work_record / work_plan
    const umsuCols = db.prepare("PRAGMA table_info(user_monthly_score_updates)").all() as { name: string }[];
    if (!umsuCols.some((c) => c.name === 'source_type')) {
      db.exec(`ALTER TABLE user_monthly_score_updates ADD COLUMN source_type TEXT NOT NULL DEFAULT 'work_record'`);
    }
    // 始终确保唯一索引为 (user_id, year_month, source_type)，避免旧库仍为 (user_id, year_month) 导致 work_plan 插入冲突
    db.exec('DROP INDEX IF EXISTS idx_umsu_user_month');
    // 去重：同一 (user_id, year_month, source_type) 只保留 id 最小的一条，避免建唯一索引失败
    db.exec(`CREATE TEMP TABLE _umsu_keep AS SELECT MIN(id) AS id FROM user_monthly_score_updates GROUP BY user_id, year_month, source_type`);
    db.exec(`DELETE FROM user_monthly_score_updates WHERE id NOT IN (SELECT id FROM _umsu_keep)`);
    db.exec('DROP TABLE IF EXISTS _umsu_keep');
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_umsu_user_month_type ON user_monthly_score_updates(user_id, year_month, source_type)');

    // 迁移：user_monthly_rankings 增加 work_plan_score, weekly_report_score, total_score
    const umrCols = db.prepare("PRAGMA table_info(user_monthly_rankings)").all() as { name: string }[];
    if (!umrCols.some((c) => c.name === 'work_plan_score')) {
      db.exec(`ALTER TABLE user_monthly_rankings ADD COLUMN work_plan_score REAL DEFAULT 0`);
    }
    if (!umrCols.some((c) => c.name === 'weekly_report_score')) {
      db.exec(`ALTER TABLE user_monthly_rankings ADD COLUMN weekly_report_score REAL DEFAULT 0`);
    }
    if (!umrCols.some((c) => c.name === 'total_score')) {
      db.exec(`ALTER TABLE user_monthly_rankings ADD COLUMN total_score REAL DEFAULT 0`);
      db.prepare('UPDATE user_monthly_rankings SET weekly_report_score = avg_score, total_score = avg_score WHERE total_score = 0 OR total_score IS NULL').run();
    }
  }
}
