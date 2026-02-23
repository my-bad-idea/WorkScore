import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { DatabaseService } from '../config/database.service';
import { SettingsService } from '../settings/settings.service';
import { validatePasswordStrength } from '../common/password.util';
import type { JwtPayload } from '../common/decorators/current-user.decorator';

export type UserRole = 'system_admin' | 'department_admin' | 'user';

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  real_name: string;
  department_id: number;
  position_id: number | null;
  is_admin: number;
  role: string;
  enabled: number;
  department_name?: string;
  position_name?: string;
}

const DEFAULT_USER_PASSWORD = 'Aa.123456';

@Injectable()
export class UsersService {
  constructor(
    private readonly db: DatabaseService,
    private readonly settingsService: SettingsService,
  ) {}

  async findAll() {
    const rows = this.db
      .getDb()
      .prepare(
        `SELECT u.id, u.username, u.real_name, u.department_id, u.position_id, u.is_admin, u.role, u.enabled, u.created_at,
                d.name AS department_name, p.name AS position_name
         FROM users u
         LEFT JOIN departments d ON u.department_id = d.id
         LEFT JOIN positions p ON u.position_id = p.id
         ORDER BY u.id`,
      )
      .all() as unknown as (UserRow & { created_at: string })[];
    return rows.map((r) => ({
      id: r.id,
      username: r.username,
      realName: r.real_name,
      departmentId: r.department_id,
      positionId: r.position_id,
      departmentName: r.department_name,
      positionName: r.position_name,
      isAdmin: !!r.is_admin,
      role: (r.role === 'system_admin' || r.role === 'department_admin' ? r.role : 'user') as UserRole,
      enabled: !!r.enabled,
      createdAt: r.created_at,
    }));
  }

  async findOne(id: number) {
    const row = this.db
      .getDb()
      .prepare(
        `SELECT u.id, u.username, u.real_name, u.department_id, u.position_id, u.is_admin, u.role, u.enabled,
                d.name AS department_name, p.name AS position_name
         FROM users u
         LEFT JOIN departments d ON u.department_id = d.id
         LEFT JOIN positions p ON u.position_id = p.id
         WHERE u.id = ?`,
      )
      .get(id) as (UserRow & { department_name?: string; position_name?: string }) | undefined;
    if (!row) return null;
    const role = row.role === 'system_admin' || row.role === 'department_admin' ? row.role : 'user';
    return {
      id: row.id,
      username: row.username,
      realName: row.real_name,
      departmentId: row.department_id,
      positionId: row.position_id,
      departmentName: row.department_name,
      positionName: row.position_name,
      isAdmin: !!row.is_admin,
      role: role as UserRole,
      enabled: !!row.enabled,
    };
  }

  async findByUsername(username: string): Promise<UserRow | null> {
    const row = this.db
      .getDb()
      .prepare(
        `SELECT u.id, u.username, u.password_hash, u.real_name, u.department_id, u.position_id, u.is_admin, u.role, u.enabled,
                d.name AS department_name, p.name AS position_name
         FROM users u
         LEFT JOIN departments d ON u.department_id = d.id
         LEFT JOIN positions p ON u.position_id = p.id
         WHERE u.username = ?`,
      )
      .get(username) as UserRow & { department_name?: string; position_name?: string } | undefined;
    return row ?? null;
  }

  async create(actor: JwtPayload, dto: { username: string; password?: string; realName: string; departmentId: number; positionId?: number; enabled?: boolean; role?: string }) {
    if (actor.role === 'user') throw new ForbiddenException('无权限');
    const db = this.db.getDb();
    const existing = db.prepare('SELECT 1 FROM users WHERE username = ?').get(dto.username);
    if (existing) throw new BadRequestException('Username already exists');
    const departmentId = actor.role === 'department_admin' ? actor.departmentId! : dto.departmentId;
    if (actor.role === 'department_admin' && dto.departmentId !== actor.departmentId) {
      throw new ForbiddenException('仅可维护本部门下的人员');
    }
    const dept = db.prepare('SELECT 1 FROM departments WHERE id = ?').get(departmentId);
    if (!dept) throw new BadRequestException('Department not found');
    if (dto.positionId != null) {
      const pos = db.prepare('SELECT 1 FROM positions WHERE id = ?').get(dto.positionId);
      if (!pos) throw new BadRequestException('Position not found');
    }
    const rawPassword =
      (typeof dto.password === 'string' && dto.password.trim()) || this.settingsService.get('default_user_password') || DEFAULT_USER_PASSWORD;
    validatePasswordStrength(rawPassword);
    const passwordHash = bcrypt.hashSync(rawPassword, 10);
    const now = new Date().toISOString();
    const isAdmin = actor.role === 'system_admin' && dto.role === 'system_admin' ? 1 : 0;
    const role = actor.role === 'system_admin' && (dto.role === 'system_admin' || dto.role === 'department_admin')
      ? (dto.role as UserRole)
      : 'user';
    db.prepare(
      `INSERT INTO users (username, password_hash, real_name, department_id, position_id, is_admin, role, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(dto.username, passwordHash, dto.realName, departmentId, dto.positionId ?? null, isAdmin, role, dto.enabled !== false ? 1 : 0, now, now);
    const row = db.prepare('SELECT id FROM users ORDER BY id DESC LIMIT 1').get() as { id: number };
    return { id: row.id };
  }

  async update(actor: JwtPayload, id: number, dto: { username?: string; password?: string; realName?: string; departmentId?: number; positionId?: number; enabled?: boolean; role?: string }) {
    const existing = await this.findOne(id);
    if (!existing) throw new NotFoundException('User not found');
    if (actor.role === 'department_admin' && existing.departmentId !== actor.departmentId) {
      throw new ForbiddenException('仅可维护本部门下的人员');
    }
    if (actor.role === 'user') throw new ForbiddenException('无权限');
    const db = this.db.getDb();
    if (dto.departmentId !== undefined && actor.role === 'department_admin' && dto.departmentId !== actor.departmentId) {
      throw new ForbiddenException('仅可维护本部门下的人员');
    }
    if (dto.username !== undefined && dto.username !== existing.username) {
      const dup = db.prepare('SELECT 1 FROM users WHERE username = ? AND id != ?').get(dto.username, id);
      if (dup) throw new BadRequestException('Username already exists');
    }
    if (dto.departmentId !== undefined) {
      const dept = db.prepare('SELECT 1 FROM departments WHERE id = ?').get(dto.departmentId);
      if (!dept) throw new BadRequestException('Department not found');
    }
    if (dto.positionId !== undefined && dto.positionId != null) {
      const pos = db.prepare('SELECT 1 FROM positions WHERE id = ?').get(dto.positionId);
      if (!pos) throw new BadRequestException('Position not found');
    }
    const now = new Date().toISOString();
    let passwordHash: string | null = null;
    if (dto.password) {
      validatePasswordStrength(dto.password);
      passwordHash = bcrypt.hashSync(dto.password, 10);
    }
    const fields: string[] = ['updated_at = ?'];
    const values: (string | number)[] = [now];
    if (dto.username !== undefined) { fields.push('username = ?'); values.push(dto.username); }
    if (dto.realName !== undefined) { fields.push('real_name = ?'); values.push(dto.realName); }
    if (dto.departmentId !== undefined) { fields.push('department_id = ?'); values.push(dto.departmentId); }
    if (dto.positionId !== undefined) { fields.push('position_id = ?'); values.push(dto.positionId); }
    if (dto.enabled !== undefined) { fields.push('enabled = ?'); values.push(dto.enabled ? 1 : 0); }
    if (passwordHash) { fields.push('password_hash = ?'); values.push(passwordHash); }
    if (dto.role !== undefined && actor.role === 'system_admin') {
      const newRole = dto.role === 'system_admin' || dto.role === 'department_admin' ? dto.role : 'user';
      fields.push('role = ?');
      values.push(newRole);
      fields.push('is_admin = ?');
      values.push(newRole === 'system_admin' ? 1 : 0);
    }
    values.push(id);
    db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return { id };
  }

  async remove(actor: JwtPayload, id: number) {
    const existing = await this.findOne(id);
    if (!existing) throw new NotFoundException('User not found');
    if (actor.role === 'department_admin' && existing.departmentId !== actor.departmentId) {
      throw new ForbiddenException('仅可维护本部门下的人员');
    }
    if (actor.role === 'user') throw new ForbiddenException('无权限');
    this.db.getDb().prepare('DELETE FROM users WHERE id = ?').run(id);
  }

  async updatePassword(id: number, passwordHash: string) {
    const now = new Date().toISOString();
    this.db.getDb().prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(passwordHash, now, id);
  }
}
