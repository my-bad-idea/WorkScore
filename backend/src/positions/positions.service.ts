import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../config/database.service';
import { ScoresService } from '../scores/scores.service';
import type { JwtPayload } from '../common/decorators/current-user.decorator';

@Injectable()
export class PositionsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly scoresService: ScoresService,
  ) {}

  async findAll() {
    const rows = this.db
      .getDb()
      .prepare(
        `SELECT p.id, p.department_id, p.name, p.assessment_criteria, p.enabled, p.created_at, p.updated_at, d.name AS department_name
         FROM positions p
         LEFT JOIN departments d ON p.department_id = d.id
         ORDER BY p.id`,
      )
      .all() as { id: number; department_id: number; name: string; assessment_criteria: string; enabled: number; created_at: string; updated_at: string; department_name: string }[];
    return rows.map((r) => ({
      id: r.id,
      departmentId: r.department_id,
      name: r.name,
      assessmentCriteria: typeof r.assessment_criteria === 'string' ? r.assessment_criteria : JSON.stringify(r.assessment_criteria),
      enabled: !!r.enabled,
      departmentName: r.department_name,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  async findOne(id: number) {
    const row = this.db
      .getDb()
      .prepare(
        `SELECT p.id, p.department_id, p.name, p.assessment_criteria, p.enabled, p.created_at, p.updated_at, d.name AS department_name
         FROM positions p
         LEFT JOIN departments d ON p.department_id = d.id
         WHERE p.id = ?`,
      )
      .get(id) as { id: number; department_id: number; name: string; assessment_criteria: string; enabled: number; created_at: string; updated_at: string; department_name: string } | undefined;
    if (!row) return null;
    return {
      id: row.id,
      departmentId: row.department_id,
      name: row.name,
      assessmentCriteria: row.assessment_criteria,
      enabled: !!row.enabled,
      departmentName: row.department_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async create(actor: JwtPayload, dto: { departmentId: number; name: string; assessmentCriteria: string | object; enabled?: boolean }) {
    if (actor.role === 'department_admin' && dto.departmentId !== actor.departmentId) {
      throw new ForbiddenException('仅可维护本部门下的岗位');
    }
    if (actor.role === 'user') throw new ForbiddenException('无权限');
    const dept = this.db.getDb().prepare('SELECT 1 FROM departments WHERE id = ?').get(dto.departmentId);
    if (!dept) throw new BadRequestException('Department not found');
    const now = new Date().toISOString();
    const criteria = typeof dto.assessmentCriteria === 'string' ? dto.assessmentCriteria : JSON.stringify(dto.assessmentCriteria);
    const enabled = dto.enabled !== false ? 1 : 0;
    this.db.getDb().prepare('INSERT INTO positions (department_id, name, assessment_criteria, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(dto.departmentId, dto.name, criteria, enabled, now, now);
    const row = this.db.getDb().prepare('SELECT id FROM positions ORDER BY id DESC LIMIT 1').get() as { id: number };
    return { id: row.id };
  }

  async update(actor: JwtPayload, id: number, dto: { departmentId?: number; name?: string; assessmentCriteria?: string | object; enabled?: boolean }) {
    const existing = await this.findOne(id);
    if (!existing) throw new NotFoundException('Position not found');
    if (actor.role === 'department_admin' && existing.departmentId !== actor.departmentId) {
      throw new ForbiddenException('仅可维护本部门下的岗位');
    }
    if (actor.role === 'user') throw new ForbiddenException('无权限');
    const targetDepartmentId = dto.departmentId ?? existing.departmentId;
    if (actor.role === 'department_admin' && targetDepartmentId !== actor.departmentId) {
      throw new ForbiddenException('仅可维护本部门下的岗位');
    }
    if (dto.departmentId !== undefined) {
      const dept = this.db.getDb().prepare('SELECT 1 FROM departments WHERE id = ?').get(dto.departmentId);
      if (!dept) throw new BadRequestException('Department not found');
    }
    const now = new Date().toISOString();
    const departmentId = dto.departmentId ?? existing.departmentId;
    const name = dto.name ?? existing.name;
    const criteria = dto.assessmentCriteria !== undefined ? (typeof dto.assessmentCriteria === 'string' ? dto.assessmentCriteria : JSON.stringify(dto.assessmentCriteria)) : existing.assessmentCriteria;
    const enabled = dto.enabled !== undefined ? (dto.enabled ? 1 : 0) : (existing.enabled ? 1 : 0);
    this.db.getDb().prepare('UPDATE positions SET department_id = ?, name = ?, assessment_criteria = ?, enabled = ?, updated_at = ? WHERE id = ?').run(departmentId, name, criteria, enabled, now, id);
    if (dto.assessmentCriteria !== undefined) {
      this.scoresService.requeueByPositionId(id);
    }
    return { id };
  }

  async remove(actor: JwtPayload, id: number) {
    const existing = await this.findOne(id);
    if (!existing) throw new NotFoundException('Position not found');
    if (actor.role === 'department_admin' && existing.departmentId !== actor.departmentId) {
      throw new ForbiddenException('仅可维护本部门下的岗位');
    }
    if (actor.role === 'user') throw new ForbiddenException('无权限');
    this.db.getDb().prepare('DELETE FROM positions WHERE id = ?').run(id);
  }
}
