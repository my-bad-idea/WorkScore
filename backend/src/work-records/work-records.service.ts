import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Inject, forwardRef } from '@nestjs/common';
import { DatabaseService } from '../config/database.service';
import { ScoresService } from '../scores/scores.service';

/** Return Monday (YYYY-MM-DD) of the week containing the given date string. */
function getMondayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class WorkRecordsService {
  constructor(
    private readonly db: DatabaseService,
    @Inject(forwardRef(() => ScoresService)) private readonly scoresService: ScoresService,
  ) {}

  async findAll(query: Record<string, string>) {
    const db = this.db.getDb();
    let sql = `SELECT w.id, w.type, w.record_date, w.content, w.recorder_id, w.created_at, w.updated_at,
               u.real_name AS recorder_name, d.name AS recorder_department_name, p.name AS recorder_position_name
               FROM work_records w
               JOIN users u ON w.recorder_id = u.id
               LEFT JOIN departments d ON u.department_id = d.id
               LEFT JOIN positions p ON u.position_id = p.id
               WHERE 1=1`;
    const params: (string | number)[] = [];
    if (query.type) { sql += ' AND w.type = ?'; params.push(query.type); }
    if (query.recordDate) { sql += ' AND w.record_date = ?'; params.push(query.recordDate); }
    if (query.recordDateStart) { sql += ' AND w.record_date >= ?'; params.push(query.recordDateStart); }
    if (query.recordDateEnd) { sql += ' AND w.record_date <= ?'; params.push(query.recordDateEnd); }
    if (query.recorderId) { sql += ' AND w.recorder_id = ?'; params.push(query.recorderId); }
    if (query.departmentId) { sql += ' AND u.department_id = ?'; params.push(query.departmentId); }
    if (query.positionId) { sql += ' AND u.position_id = ?'; params.push(query.positionId); }
    sql += ' ORDER BY w.record_date DESC, w.id DESC';
    const rows = db.prepare(sql).all(...params) as { id: number; type: string; record_date: string; content: string; recorder_id: number; created_at: string; updated_at: string; recorder_name: string; recorder_department_name: string | null; recorder_position_name: string | null }[];
    const summaries = await this.scoresService.getSummariesForWorkRecordIds(rows.map((r) => r.id));
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      recordDate: r.record_date,
      content: r.content,
      recorderId: r.recorder_id,
      recorderName: r.recorder_name,
      recorderDepartmentName: r.recorder_department_name ?? undefined,
      recorderPositionName: r.recorder_position_name ?? undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      totalScore: summaries[r.id] ?? 0,
    }));
  }

  async findOne(id: number) {
    const row = this.db.getDb().prepare(
      `SELECT w.id, w.type, w.record_date, w.content, w.recorder_id, w.created_at, w.updated_at,
              u.real_name AS recorder_name, d.name AS recorder_department_name, p.name AS recorder_position_name
       FROM work_records w
       JOIN users u ON w.recorder_id = u.id
       LEFT JOIN departments d ON u.department_id = d.id
       LEFT JOIN positions p ON u.position_id = p.id
       WHERE w.id = ?`,
    ).get(id) as { id: number; type: string; record_date: string; content: string; recorder_id: number; created_at: string; updated_at: string; recorder_name: string; recorder_department_name: string | null; recorder_position_name: string | null } | undefined;
    if (!row) return null;
    return {
      id: row.id,
      type: row.type,
      recordDate: row.record_date,
      content: row.content,
      recorderId: row.recorder_id,
      recorderName: row.recorder_name,
      recorderDepartmentName: row.recorder_department_name ?? undefined,
      recorderPositionName: row.recorder_position_name ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private checkUniqueness(recorderId: number, type: string, recordDate: string) {
    const db = this.db.getDb();
    const normalizedDate = type === 'weekly' ? getMondayOfWeek(recordDate) : recordDate;
    const existing = db.prepare('SELECT 1 FROM work_records WHERE recorder_id = ? AND type = ? AND record_date = ?').get(recorderId, type, normalizedDate);
    if (existing) {
      if (type === 'daily') throw new BadRequestException('当日已有日报');
      throw new BadRequestException('当周已有周报');
    }
    return normalizedDate;
  }

  async create(recorderId: number, dto: { type: string; recordDate: string; content: string }) {
    if (dto.type !== 'daily' && dto.type !== 'weekly') throw new BadRequestException('type must be daily or weekly');
    const recordDate = this.checkUniqueness(recorderId, dto.type, dto.recordDate);
    const now = new Date().toISOString();
    this.db.getDb().prepare(
      'INSERT INTO work_records (type, record_date, content, recorder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(dto.type, recordDate, dto.content, recorderId, now, now);
    const row = this.db.getDb().prepare('SELECT id FROM work_records ORDER BY id DESC LIMIT 1').get() as { id: number };
    this.db.getDb().prepare('INSERT INTO score_queue (work_record_id, status, created_at) VALUES (?, ?, ?)').run(row.id, 'pending', now);
    return { id: row.id };
  }

  async update(id: number, userId: number, dto: { type?: string; recordDate?: string; content?: string }) {
    const existing = await this.findOne(id);
    if (!existing) throw new NotFoundException('Work record not found');
    if (existing.recorderId !== userId) throw new ForbiddenException('Only the recorder can update');
    const type = dto.type ?? existing.type;
    const recordDateRaw = dto.recordDate ?? existing.recordDate;
    const recordDate = type === 'weekly' ? getMondayOfWeek(recordDateRaw) : recordDateRaw;
    if (type !== existing.type || recordDate !== (existing.type === 'weekly' ? getMondayOfWeek(existing.recordDate) : existing.recordDate)) {
      this.checkUniqueness(userId, type, recordDate);
    }
    const content = dto.content ?? existing.content;
    const now = new Date().toISOString();
    this.db.getDb().prepare('UPDATE work_records SET type = ?, record_date = ?, content = ?, updated_at = ? WHERE id = ?').run(type, recordDate, content, now, id);
    this.scoresService.requeueByWorkRecordId(id);
    return { id };
  }

  async remove(id: number, userId: number) {
    const existing = await this.findOne(id);
    if (!existing) throw new NotFoundException('Work record not found');
    if (existing.recorderId !== userId) throw new ForbiddenException('Only the recorder can delete');
    this.scoresService.markScoreDirty(id);
    const db = this.db.getDb();
    db.prepare('DELETE FROM score_records WHERE work_record_id = ?').run(id);
    db.prepare('DELETE FROM score_queue WHERE work_record_id = ?').run(id);
    db.prepare('DELETE FROM work_records WHERE id = ?').run(id);
  }
}
