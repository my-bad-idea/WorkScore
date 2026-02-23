import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../config/database.service';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class AssessmentsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly settings: SettingsService,
  ) {}

  async getMonthlyRankings(year: string, month: string, departmentId?: string, positionId?: string) {
    const yearMonth = `${year}-${month.padStart(2, '0')}`;
    const db = this.db.getDb();
    const rows = db.prepare(
      `SELECT r.user_id, r.avg_score, r.department_id, r.position_id,
              u.real_name, d.name AS department_name, p.name AS position_name
       FROM user_monthly_rankings r
       JOIN users u ON r.user_id = u.id
       JOIN departments d ON r.department_id = d.id
       LEFT JOIN positions p ON r.position_id = p.id
       WHERE r.year_month = ?`,
    ).all(yearMonth) as { user_id: number; avg_score: number; department_id: number; position_id: number | null; real_name: string; department_name: string; position_name: string | null }[];

    const byDept = new Map<number, { departmentName: string; list: { userId: number; userName: string; score: number; positionName: string | null }[] }>();
    for (const r of rows) {
      if (departmentId != null && String(r.department_id) !== departmentId) continue;
      if (positionId != null && (r.position_id == null || String(r.position_id) !== positionId)) continue;
      let dept = byDept.get(r.department_id);
      if (!dept) dept = { departmentName: r.department_name, list: [] };
      dept.list.push({ userId: r.user_id, userName: r.real_name, score: r.avg_score, positionName: r.position_name });
      byDept.set(r.department_id, dept);
    }

    const result: { departmentId: number; departmentName: string; rankings: { userId: number; userName: string; score: number; rank: number; positionName?: string | null }[] }[] = [];
    for (const [deptId, dept] of byDept) {
      dept.list.sort((a, b) => b.score - a.score);
      result.push({
        departmentId: deptId,
        departmentName: dept.departmentName,
        rankings: dept.list.map((r, i) => ({ ...r, rank: i + 1 })),
      });
    }
    return result;
  }

  async getYearlyRankings(year: string, departmentId?: string, positionId?: string) {
    const db = this.db.getDb();
    const rows = db.prepare(
      `SELECT r.user_id,
              SUM(r.score_sum) / SUM(r.record_count) AS avg_score,
              r.department_id, r.position_id,
              u.real_name, d.name AS department_name, p.name AS position_name
       FROM user_monthly_rankings r
       JOIN users u ON r.user_id = u.id
       JOIN departments d ON r.department_id = d.id
       LEFT JOIN positions p ON r.position_id = p.id
       WHERE r.year_month LIKE ?
       GROUP BY r.user_id`,
    ).all(`${year}-%`) as { user_id: number; avg_score: number; department_id: number; position_id: number | null; real_name: string; department_name: string; position_name: string | null }[];

    const byDept = new Map<number, { departmentName: string; list: { userId: number; userName: string; score: number; positionName: string | null }[] }>();
    for (const r of rows) {
      if (departmentId != null && String(r.department_id) !== departmentId) continue;
      if (positionId != null && (r.position_id == null || String(r.position_id) !== positionId)) continue;
      let dept = byDept.get(r.department_id);
      if (!dept) dept = { departmentName: r.department_name, list: [] };
      dept.list.push({ userId: r.user_id, userName: r.real_name, score: r.avg_score, positionName: r.position_name });
      byDept.set(r.department_id, dept);
    }

    const result: { departmentId: number; departmentName: string; rankings: { userId: number; userName: string; score: number; rank: number; positionName?: string | null }[] }[] = [];
    for (const [deptId, dept] of byDept) {
      dept.list.sort((a, b) => b.score - a.score);
      result.push({
        departmentId: deptId,
        departmentName: dept.departmentName,
        rankings: dept.list.map((r, i) => ({ ...r, rank: i + 1 })),
      });
    }
    return result;
  }
}
