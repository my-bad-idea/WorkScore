import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../config/database.service';
import { ScoresService } from '../scores/scores.service';
import type { JwtPayload } from '../common/decorators/current-user.decorator';

/** 从计划起止或创建时间得到所属月份 YYYY-MM */
function planYearMonth(actualStart?: string | null, plannedStart?: string | null, createdAt?: string | null): string {
  const raw = actualStart || plannedStart || createdAt || '';
  if (raw.length >= 7) return raw.slice(0, 7);
  return new Date().toISOString().slice(0, 7);
}

const VALID_STATUSES = ['pending', 'in_progress', 'completed', 'cancelled', 'on_hold', 'delayed'];
const VALID_PRIORITIES = ['high', 'medium', 'low'];

interface WorkPlanRow {
  id: number;
  user_id: number;
  creator_id: number;
  department_id: number;
  executor_id: number | null;
  system: string | null;
  module: string | null;
  plan_content: string;
  planned_start_at: string | null;
  planned_end_at: string | null;
  planned_duration_minutes: number | null;
  actual_start_at: string | null;
  actual_end_at: string | null;
  actual_duration_minutes: number | null;
  priority: string;
  status: string;
  remark: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  owner_name: string;
  creator_name: string;
  executor_name: string | null;
  department_name: string;
}

@Injectable()
export class WorkPlansService {
  constructor(
    private readonly db: DatabaseService,
    private readonly scoresService: ScoresService,
  ) {}

  private readonly selectBase = `
    SELECT wp.id, wp.user_id, wp.creator_id, wp.department_id, wp.executor_id,
           wp.system, wp.module, wp.plan_content,
           wp.planned_start_at, wp.planned_end_at, wp.planned_duration_minutes,
           wp.actual_start_at, wp.actual_end_at, wp.actual_duration_minutes,
           wp.priority, wp.status, wp.remark, wp.sort_order,
           wp.created_at, wp.updated_at,
           ou.real_name AS owner_name,
           cu.real_name AS creator_name,
           eu.real_name AS executor_name,
           d.name AS department_name
    FROM work_plans wp
    JOIN users ou ON wp.user_id = ou.id
    JOIN users cu ON wp.creator_id = cu.id
    LEFT JOIN users eu ON wp.executor_id = eu.id
    JOIN departments d ON wp.department_id = d.id`;

  private toDto(r: WorkPlanRow) {
    return {
      id: r.id,
      userId: r.user_id,
      ownerName: r.owner_name,
      creatorId: r.creator_id,
      creatorName: r.creator_name,
      departmentId: r.department_id,
      departmentName: r.department_name,
      executorId: r.executor_id ?? undefined,
      executorName: r.executor_name ?? undefined,
      system: r.system ?? undefined,
      module: r.module ?? undefined,
      planContent: r.plan_content,
      plannedStartAt: r.planned_start_at ?? undefined,
      plannedEndAt: r.planned_end_at ?? undefined,
      plannedDurationMinutes: r.planned_duration_minutes ?? undefined,
      actualStartAt: r.actual_start_at ?? undefined,
      actualEndAt: r.actual_end_at ?? undefined,
      actualDurationMinutes: r.actual_duration_minutes ?? undefined,
      priority: r.priority,
      status: r.status,
      remark: r.remark ?? undefined,
      sortOrder: r.sort_order,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  async findAll(user: JwtPayload, query: Record<string, string>) {
    const db = this.db.getDb();
    let sql = `${this.selectBase} WHERE wp.department_id = ?`;
    const params: (string | number)[] = [user.departmentId!];

    if (query.status) { sql += ' AND wp.status = ?'; params.push(query.status); }
    if (query.priority) { sql += ' AND wp.priority = ?'; params.push(query.priority); }
    if (query.executorId) { sql += ' AND wp.executor_id = ?'; params.push(query.executorId); }
    if (query.userId) { sql += ' AND wp.user_id = ?'; params.push(query.userId); }
    if (query.system) { sql += ' AND wp.system LIKE ?'; params.push(`%${query.system}%`); }
    if (query.module) { sql += ' AND wp.module LIKE ?'; params.push(`%${query.module}%`); }
    if (query.plannedStartFrom) { sql += ' AND wp.planned_start_at >= ?'; params.push(query.plannedStartFrom); }
    if (query.plannedStartTo) { sql += ' AND wp.planned_start_at <= ?'; params.push(query.plannedStartTo); }

    sql += ' ORDER BY wp.sort_order ASC, wp.created_at DESC';
    const rows = db.prepare(sql).all(...params) as unknown as WorkPlanRow[];
    return rows.map((r) => this.toDto(r));
  }

  async findOne(id: number, user: JwtPayload) {
    const db = this.db.getDb();
    const row = db.prepare(`${this.selectBase} WHERE wp.id = ?`).get(id) as WorkPlanRow | undefined;
    if (!row) throw new NotFoundException('工作计划不存在');
    if (row.department_id !== user.departmentId) throw new ForbiddenException('无权访问其他部门的计划');
    return this.toDto(row);
  }

  private validateUserInDepartment(db: ReturnType<DatabaseService['getDb']>, targetUserId: number, departmentId: number) {
    const u = db.prepare('SELECT department_id FROM users WHERE id = ? AND enabled = 1').get(targetUserId) as { department_id: number } | undefined;
    if (!u) throw new BadRequestException('指定的用户不存在或已禁用');
    if (u.department_id !== departmentId) throw new ForbiddenException('只能指定同部门的用户');
  }

  async create(user: JwtPayload, dto: {
    userId?: number; executorId?: number;
    system?: string; module?: string; planContent: string;
    plannedStartAt?: string; plannedEndAt?: string; plannedDurationMinutes?: number;
    actualStartAt?: string; actualEndAt?: string; actualDurationMinutes?: number;
    priority?: string; status?: string; remark?: string; sortOrder?: number;
  }) {
    if (!dto.planContent?.trim()) throw new BadRequestException('计划内容不能为空');
    if (!dto.system?.trim()) throw new BadRequestException('系统不能为空');
    if (!dto.module?.trim()) throw new BadRequestException('模块不能为空');
    if (!dto.plannedStartAt) throw new BadRequestException('计划开始时间不能为空');
    if (!dto.plannedEndAt) throw new BadRequestException('计划结束时间不能为空');
    if (dto.plannedDurationMinutes == null) throw new BadRequestException('计划时长不能为空');
    if (!dto.executorId) throw new BadRequestException('执行人不能为空');

    const db = this.db.getDb();
    const ownerUserId = dto.userId ?? user.sub;
    const deptId = user.departmentId!;

    if (dto.userId && dto.userId !== user.sub) {
      this.validateUserInDepartment(db, dto.userId, deptId);
    }
    this.validateUserInDepartment(db, dto.executorId, deptId);
    if (dto.status && !VALID_STATUSES.includes(dto.status)) {
      throw new BadRequestException(`status 须为 ${VALID_STATUSES.join(' / ')} 之一`);
    }
    if (dto.priority && !VALID_PRIORITIES.includes(dto.priority)) {
      throw new BadRequestException(`priority 须为 ${VALID_PRIORITIES.join(' / ')} 之一`);
    }
    if (dto.plannedDurationMinutes != null && dto.plannedDurationMinutes < 0) throw new BadRequestException('计划时长不能为负');
    if (dto.actualDurationMinutes != null && dto.actualDurationMinutes < 0) throw new BadRequestException('实际时长不能为负');

    const now = new Date().toISOString();
    let sortOrder = dto.sortOrder;
    if (sortOrder == null) {
      const maxRow = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS mx FROM work_plans WHERE department_id = ?').get(deptId) as { mx: number };
      sortOrder = maxRow.mx + 1;
    }
    db.prepare(`
      INSERT INTO work_plans (user_id, creator_id, department_id, executor_id,
        system, module, plan_content,
        planned_start_at, planned_end_at, planned_duration_minutes,
        actual_start_at, actual_end_at, actual_duration_minutes,
        priority, status, remark, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      ownerUserId, user.sub, deptId, dto.executorId ?? null,
      dto.system ?? null, dto.module ?? null, dto.planContent,
      dto.plannedStartAt ?? null, dto.plannedEndAt ?? null, dto.plannedDurationMinutes ?? null,
      dto.actualStartAt ?? null, dto.actualEndAt ?? null, dto.actualDurationMinutes ?? null,
      dto.priority ?? 'medium', dto.status ?? 'pending',
      dto.remark ?? null, sortOrder, now, now,
    );
    const row = db.prepare('SELECT id FROM work_plans ORDER BY id DESC LIMIT 1').get() as { id: number };
    const yearMonth = planYearMonth(dto.actualStartAt, dto.plannedStartAt, now);
    this.scoresService.markWorkPlanScoreDirty(dto.executorId ?? ownerUserId, yearMonth);
    return { id: row.id };
  }

  private canEdit(plan: WorkPlanRow, userId: number): boolean {
    return plan.user_id === userId || plan.executor_id === userId;
  }

  async update(id: number, user: JwtPayload, dto: {
    executorId?: number | null;
    system?: string; module?: string; planContent?: string;
    plannedStartAt?: string; plannedEndAt?: string; plannedDurationMinutes?: number;
    actualStartAt?: string; actualEndAt?: string; actualDurationMinutes?: number;
    priority?: string; status?: string; remark?: string; sortOrder?: number;
  }) {
    const db = this.db.getDb();
    const row = db.prepare('SELECT * FROM work_plans WHERE id = ?').get(id) as WorkPlanRow | undefined;
    if (!row) throw new NotFoundException('工作计划不存在');
    if (row.department_id !== user.departmentId) throw new ForbiddenException('无权访问其他部门的计划');
    if (!this.canEdit(row, user.sub)) throw new ForbiddenException('仅计划所属用户或执行人可修改');

    if (dto.executorId !== undefined && dto.executorId !== null) {
      this.validateUserInDepartment(db, dto.executorId, row.department_id);
    }
    if (dto.status !== undefined && !VALID_STATUSES.includes(dto.status)) {
      throw new BadRequestException(`status 须为 ${VALID_STATUSES.join(' / ')} 之一`);
    }
    if (dto.priority !== undefined && !VALID_PRIORITIES.includes(dto.priority)) {
      throw new BadRequestException(`priority 须为 ${VALID_PRIORITIES.join(' / ')} 之一`);
    }
    if (dto.plannedDurationMinutes != null && dto.plannedDurationMinutes < 0) throw new BadRequestException('计划时长不能为负');
    if (dto.actualDurationMinutes != null && dto.actualDurationMinutes < 0) throw new BadRequestException('实际时长不能为负');

    const now = new Date().toISOString();
    const fields: string[] = ['updated_at = ?'];
    const values: (string | number | null)[] = [now];

    const maybeSet = (col: string, val: unknown) => {
      if (val !== undefined) { fields.push(`${col} = ?`); values.push(val as string | number | null); }
    };

    maybeSet('executor_id', dto.executorId !== undefined ? (dto.executorId ?? null) : undefined);
    maybeSet('system', dto.system);
    maybeSet('module', dto.module);
    maybeSet('plan_content', dto.planContent);
    maybeSet('planned_start_at', dto.plannedStartAt);
    maybeSet('planned_end_at', dto.plannedEndAt);
    maybeSet('planned_duration_minutes', dto.plannedDurationMinutes);
    maybeSet('actual_start_at', dto.actualStartAt);
    maybeSet('actual_end_at', dto.actualEndAt);
    maybeSet('actual_duration_minutes', dto.actualDurationMinutes);
    maybeSet('priority', dto.priority);
    maybeSet('status', dto.status);
    maybeSet('remark', dto.remark);
    maybeSet('sort_order', dto.sortOrder);

    values.push(id);
    db.prepare(`UPDATE work_plans SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    const yearMonth = planYearMonth(dto.actualStartAt ?? row.actual_start_at, dto.plannedStartAt ?? row.planned_start_at, row.created_at);
    const effectiveExecutor = dto.executorId !== undefined ? dto.executorId : row.executor_id;
    this.scoresService.markWorkPlanScoreDirty(effectiveExecutor ?? row.user_id, yearMonth);
    return { id };
  }

  async remove(id: number, user: JwtPayload) {
    const db = this.db.getDb();
    const row = db.prepare('SELECT * FROM work_plans WHERE id = ?').get(id) as WorkPlanRow | undefined;
    if (!row) throw new NotFoundException('工作计划不存在');
    if (row.department_id !== user.departmentId) throw new ForbiddenException('无权访问其他部门的计划');
    if (!this.canEdit(row, user.sub)) throw new ForbiddenException('仅计划所属用户或执行人可删除');
    const yearMonth = planYearMonth(row.actual_start_at, row.planned_start_at, row.created_at);
    this.scoresService.markWorkPlanScoreDirty(row.executor_id ?? row.user_id, yearMonth);
    db.prepare('DELETE FROM work_plans WHERE id = ?').run(id);
  }

  async reorder(user: JwtPayload, items: { id: number; sortOrder: number }[]) {
    const db = this.db.getDb();
    const now = new Date().toISOString();
    const stmt = db.prepare('UPDATE work_plans SET sort_order = ?, updated_at = ? WHERE id = ? AND department_id = ?');
    for (const item of items) {
      stmt.run(item.sortOrder, now, item.id, user.departmentId!);
    }
  }
}
