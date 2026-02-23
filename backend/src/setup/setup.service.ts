import { Injectable, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { DatabaseService } from '../config/database.service';

/** 安装时密码强度校验：至少 8 位，且同时包含字母和数字 */
function validateSetupPassword(password: string): void {
  if (!password || password.length < 8) {
    throw new BadRequestException('密码至少 8 位');
  }
  if (!/[a-zA-Z]/.test(password)) {
    throw new BadRequestException('密码须包含至少一个英文字母');
  }
  if (!/\d/.test(password)) {
    throw new BadRequestException('密码须包含至少一个数字');
  }
}

@Injectable()
export class SetupService {
  private readonly logger = new Logger(SetupService.name);

  constructor(private readonly db: DatabaseService) {}

  async getStatus(): Promise<{ installed: boolean }> {
    const row = this.db.getDb().prepare('SELECT 1 FROM users LIMIT 1').get();
    return { installed: !!row };
  }

  async init(body: { username: string; password: string; realName: string }) {
    const db = this.db.getDb();
    const existing = db.prepare('SELECT 1 FROM users LIMIT 1').get();
    if (existing) throw new ConflictException('Already installed');

    validateSetupPassword(body.password);
    const passwordHash = bcrypt.hashSync(body.password, 10);
    const now = new Date().toISOString();

    db.prepare(
      'INSERT INTO departments (name, enabled, created_at, updated_at) VALUES (?, 1, ?, ?)',
    ).run('默认部门', now, now);
    const deptRow = db.prepare('SELECT id FROM departments ORDER BY id DESC LIMIT 1').get() as {
      id: number;
    };
    const departmentId = deptRow.id;

    db.prepare(
      `INSERT INTO users (username, password_hash, real_name, department_id, is_admin, role, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, 'system_admin', 1, ?, ?)`,
    ).run(body.username, passwordHash, body.realName, departmentId, now, now);

    db.prepare(
      `INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES ('token_expire_hours', ?, ?)`,
    ).run('168', now);

    this.logger.log(`Setup completed: admin ${body.username} created`);
    return { message: 'ok' };
  }
}
