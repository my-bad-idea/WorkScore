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
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_umsu_user_month ON user_monthly_score_updates(user_id, year_month)',
    ];
    for (const sql of indexStatements) {
      db.exec(sql);
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
  }
}
