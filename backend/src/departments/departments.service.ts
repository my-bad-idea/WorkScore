import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../config/database.service';

@Injectable()
export class DepartmentsService {
  constructor(private readonly db: DatabaseService) {}

  async findAll() {
    const rows = this.db
      .getDb()
      .prepare('SELECT id, name, enabled, created_at, updated_at FROM departments ORDER BY id')
      .all() as { id: number; name: string; enabled: number; created_at: string; updated_at: string }[];
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      enabled: !!r.enabled,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  async findOne(id: number) {
    const row = this.db
      .getDb()
      .prepare('SELECT id, name, enabled, created_at, updated_at FROM departments WHERE id = ?')
      .get(id) as { id: number; name: string; enabled: number; created_at: string; updated_at: string } | undefined;
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      enabled: !!row.enabled,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async create(dto: { name: string; enabled?: boolean }) {
    const now = new Date().toISOString();
    const enabled = dto.enabled !== false ? 1 : 0;
    this.db.getDb().prepare('INSERT INTO departments (name, enabled, created_at, updated_at) VALUES (?, ?, ?, ?)').run(dto.name, enabled, now, now);
    const row = this.db.getDb().prepare('SELECT id FROM departments ORDER BY id DESC LIMIT 1').get() as { id: number };
    return { id: row.id };
  }

  async update(id: number, dto: { name?: string; enabled?: boolean }) {
    const existing = await this.findOne(id);
    if (!existing) throw new NotFoundException('Department not found');
    const now = new Date().toISOString();
    const name = dto.name ?? existing.name;
    const enabled = dto.enabled !== undefined ? (dto.enabled ? 1 : 0) : (existing.enabled ? 1 : 0);
    this.db.getDb().prepare('UPDATE departments SET name = ?, enabled = ?, updated_at = ? WHERE id = ?').run(name, enabled, now, id);
    return { id };
  }

  async remove(id: number) {
    const existing = await this.findOne(id);
    if (!existing) throw new NotFoundException('Department not found');
    this.db.getDb().prepare('DELETE FROM departments WHERE id = ?').run(id);
  }
}
