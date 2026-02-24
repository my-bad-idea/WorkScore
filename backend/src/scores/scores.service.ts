import { Injectable, NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../config/database.service';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class ScoresService {
  constructor(
    private readonly db: DatabaseService,
    private readonly settings: SettingsService,
  ) {}

  async findByWorkRecordId(workRecordId: number) {
    const rows = this.db.getDb().prepare(
      `SELECT s.id, s.work_record_id, s.scorer_id, s.score_type, s.score_details, s.total_score, s.remark, s.scored_at, u.real_name AS scorer_name
       FROM score_records s JOIN users u ON s.scorer_id = u.id WHERE s.work_record_id = ? ORDER BY s.scored_at`,
    ).all(workRecordId) as { id: number; work_record_id: number; scorer_id: number; score_type: string; score_details: string; total_score: number; remark: string | null; scored_at: string; scorer_name: string }[];
    return rows.map((r) => ({
      id: r.id,
      workRecordId: r.work_record_id,
      scorerId: r.scorer_id,
      scoreType: r.score_type,
      scoreDetails: typeof r.score_details === 'string' ? JSON.parse(r.score_details) : r.score_details,
      totalScore: r.total_score,
      remark: r.remark,
      scoredAt: r.scored_at,
      scorerName: r.scorer_name,
    }));
  }

  async getCriteriaForWorkRecord(workRecordId: number) {
    const row = this.db.getDb().prepare(
      `SELECT u.position_id FROM work_records w JOIN users u ON w.recorder_id = u.id WHERE w.id = ?`,
    ).get(workRecordId) as { position_id: number | null } | undefined;
    if (!row || row.position_id == null) return [];
    const pos = this.db.getDb().prepare('SELECT assessment_criteria FROM positions WHERE id = ?').get(row.position_id) as { assessment_criteria: string } | undefined;
    if (!pos) return [];
    try {
      return typeof pos.assessment_criteria === 'string' ? JSON.parse(pos.assessment_criteria) : pos.assessment_criteria;
    } catch {
      return [];
    }
  }

  async getSummary(workRecordId: number) {
    const rows = this.db.getDb().prepare('SELECT total_score, score_type FROM score_records WHERE work_record_id = ?').all(workRecordId) as { total_score: number; score_type: string }[];
    if (rows.length === 0) return { totalScore: 0 };
    const all = await this.settings.getAll();
    const aiPct = Math.min(100, Math.max(0, parseInt(all.llm_assessment_weight_percent || '80', 10)));
    const aiRatio = aiPct / 100;
    const aiRow = rows.find((r) => r.score_type === 'ai');
    const manualRows = rows.filter((r) => r.score_type === 'manual');
    const manualAvg = manualRows.length > 0
      ? manualRows.reduce((s, r) => s + r.total_score, 0) / manualRows.length
      : undefined;
    const totalScore = aiRow && manualAvg != null
      ? aiRow.total_score * aiRatio + manualAvg * (1 - aiRatio)
      : (aiRow ?? (manualAvg != null ? { total_score: manualAvg } : null))?.total_score ?? 0;
    return { totalScore };
  }

  /** 批量获取多条工作记录的总成绩，供列表展示 */
  async getSummariesForWorkRecordIds(workRecordIds: number[]): Promise<Record<number, number>> {
    if (workRecordIds.length === 0) return {};
    const all = await this.settings.getAll();
    const aiPct = Math.min(100, Math.max(0, parseInt(all.llm_assessment_weight_percent || '80', 10)));
    const aiRatio = aiPct / 100;
    const placeholders = workRecordIds.map(() => '?').join(',');
    const rows = this.db.getDb().prepare(
      `SELECT work_record_id, total_score, score_type FROM score_records WHERE work_record_id IN (${placeholders})`,
    ).all(...workRecordIds) as { work_record_id: number; total_score: number; score_type: string }[];
    const byId = new Map<number, { ai?: number; manuals: number[] }>();
    for (const r of rows) {
      let entry = byId.get(r.work_record_id);
      if (!entry) { entry = { manuals: [] }; byId.set(r.work_record_id, entry); }
      if (r.score_type === 'ai') entry.ai = r.total_score;
      else entry.manuals.push(r.total_score);
    }
    const result: Record<number, number> = {};
    for (const id of workRecordIds) {
      const entry = byId.get(id);
      if (!entry) { result[id] = 0; continue; }
      const manualAvg = entry.manuals.length > 0 ? entry.manuals.reduce((s, v) => s + v, 0) / entry.manuals.length : undefined;
      result[id] = entry.ai != null && manualAvg != null
        ? entry.ai * aiRatio + manualAvg * (1 - aiRatio)
        : (entry.ai ?? (manualAvg != null ? manualAvg : 0)) ?? 0;
    }
    return result;
  }

  async createScore(workRecordId: number, userId: number, dto: { scoreDetails: { item_name: string; score: number; comment?: string }[]; totalScore: number; remark: string }) {
    const db = this.db.getDb();
    const workRecord = db.prepare('SELECT id, recorder_id FROM work_records WHERE id = ?').get(workRecordId) as { id: number; recorder_id: number } | undefined;
    if (!workRecord) throw new NotFoundException('工作记录不存在');
    const recorderId = workRecord.recorder_id;

    // 不能给自己的记录评分
    if (userId === recorderId) throw new ForbiddenException('不能给自己的记录评分');
    // 同一人对同一条工作记录只能人工评分一次
    const existingByUser = db.prepare('SELECT 1 FROM score_records WHERE work_record_id = ? AND score_type = ? AND scorer_id = ?').get(workRecordId, 'manual', userId);
    if (existingByUser) throw new ConflictException('您已对该记录评过分，每人每条记录只能评分一次');

    const totalScore = Number(dto.totalScore);
    if (Number.isNaN(totalScore) || totalScore < 0 || totalScore > 100) throw new BadRequestException('总分须为 0–100 之间的数值');
    const remark = (dto.remark ?? '').trim();
    if (!remark) throw new BadRequestException('请填写评分说明');

    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO score_records (work_record_id, scorer_id, score_type, score_details, total_score, remark, scored_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(workRecordId, userId, 'manual', JSON.stringify(dto.scoreDetails), totalScore, remark, now);
    this.markScoreDirty(workRecordId);
    const row = db.prepare('SELECT id FROM score_records ORDER BY id DESC LIMIT 1').get() as { id: number };
    return { id: row.id };
  }

  async getQueueList(query: Record<string, string>) {
    const db = this.db.getDb();
    let sql = `SELECT q.id, q.work_record_id, q.status, q.created_at, q.processed_at, q.error_message,
                w.type, w.record_date, w.recorder_id, u.real_name AS recorder_name
                FROM score_queue q
                JOIN work_records w ON q.work_record_id = w.id
                JOIN users u ON w.recorder_id = u.id
                WHERE 1=1`;
    const params: (string | number)[] = [];
    if (query.status) { sql += ' AND q.status = ?'; params.push(query.status); }
    sql += ' ORDER BY q.id DESC LIMIT 100';
    const rows = db.prepare(sql).all(...params) as { id: number; work_record_id: number; status: string; created_at: string; processed_at: string | null; error_message: string | null; type: string; record_date: string; recorder_name: string }[];
    return rows.map((r) => ({
      id: r.id,
      workRecordId: r.work_record_id,
      status: r.status,
      createdAt: r.created_at,
      processedAt: r.processed_at,
      errorMessage: r.error_message,
      type: r.type,
      recordDate: r.record_date,
      recorderName: r.recorder_name,
    }));
  }

  async removeScore(scoreId: number, userId: number) {
    const row = this.db.getDb().prepare('SELECT id, work_record_id, scorer_id, score_type FROM score_records WHERE id = ?').get(scoreId) as { id: number; work_record_id: number; scorer_id: number; score_type: string } | undefined;
    if (!row) throw new NotFoundException('Score not found');
    if (row.score_type !== 'manual') throw new ForbiddenException('Cannot delete AI score');
    if (row.scorer_id !== userId) throw new ForbiddenException('Only the scorer can delete');
    this.db.getDb().prepare('DELETE FROM score_records WHERE id = ?').run(scoreId);
    this.markScoreDirty(row.work_record_id);
  }

  /**
   * 标记指定工作记录所属人员当月的月分值需重新统计（评分变更后由后台任务刷新人员月排名）。
   */
  markScoreDirty(workRecordId: number): void {
    const db = this.db.getDb();
    const row = db.prepare(
      'SELECT recorder_id, record_date FROM work_records WHERE id = ?',
    ).get(workRecordId) as { recorder_id: number; record_date: string } | undefined;
    if (!row) return;
    const yearMonth = row.record_date.slice(0, 7);
    this.upsertScoreUpdate(db, row.recorder_id, yearMonth, 'work_record');
  }

  /**
   * 标记指定用户指定月份的工作计划分数需重新统计（计划变更后由后台任务刷新）。
   */
  markWorkPlanScoreDirty(userId: number, yearMonth: string): void {
    const db = this.db.getDb();
    this.upsertScoreUpdate(db, userId, yearMonth, 'work_plan');
  }

  private upsertScoreUpdate(db: ReturnType<DatabaseService['getDb']>, userId: number, yearMonth: string, sourceType: 'work_record' | 'work_plan'): void {
    const now = new Date().toISOString();
    const stmt = db.prepare(
      `INSERT INTO user_monthly_score_updates (user_id, year_month, source_type, last_updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, year_month, source_type) DO UPDATE SET last_updated_at = excluded.last_updated_at`,
    );
    stmt.run(userId, yearMonth, sourceType, now);
  }

  /**
   * 将指定工作记录重新加入 AI 考核队列：删除该记录的 AI 评分并置为待处理（日报/周报修改后调用）。
   */
  requeueByWorkRecordId(workRecordId: number): void {
    const db = this.db.getDb();
    db.prepare('DELETE FROM score_records WHERE work_record_id = ? AND score_type = ?').run(workRecordId, 'ai');
    this.markScoreDirty(workRecordId);
    const r = db.prepare('UPDATE score_queue SET status = ?, processed_at = ?, error_message = ? WHERE work_record_id = ?').run('pending', null, null, workRecordId);
    if (r.changes === 0) {
      db.prepare('INSERT INTO score_queue (work_record_id, status, created_at) VALUES (?, ?, ?)').run(workRecordId, 'pending', new Date().toISOString());
    }
  }

  /**
   * 将指定岗位下所有工作记录重新加入 AI 考核队列（岗位考核标准修改后调用）。
   */
  requeueByPositionId(positionId: number): void {
    const db = this.db.getDb();
    const rows = db.prepare(
      'SELECT w.id AS work_record_id FROM work_records w JOIN users u ON w.recorder_id = u.id WHERE u.position_id = ?',
    ).all(positionId) as { work_record_id: number }[];
    for (const { work_record_id } of rows) {
      this.requeueByWorkRecordId(work_record_id);
    }
  }

  /** AI 考核测试：根据考核标准与工作内容调用 LLM 返回评分与评语（不落库） */
  async aiTest(criteriaMarkdown: string, workContent: string): Promise<{ scoreDetails: { item_name: string; score: number; comment: string }[]; totalScore: number; remark: string }> {
    const criteria = (criteriaMarkdown || '').trim();
    const content = (workContent || '').trim().slice(0, 3000);
    if (!criteria) throw new BadRequestException('请输入或选择考核标准');
    if (!content) throw new BadRequestException('请输入周报/日报内容');

    const all = await this.settings.getAll();
    const apiUrl = all.llm_api_url || process.env.LLM_API_URL;
    const apiKey = all.llm_api_key || process.env.LLM_API_KEY;
    const model = all.llm_model || process.env.LLM_MODEL || 'gpt-3.5-turbo';
    const temperature = Math.min(2, Math.max(0, parseFloat(all.llm_temperature ?? '0') || 0));
    const topP = Math.min(1, Math.max(0, parseFloat(all.llm_top_p ?? '1') || 1));
    if (!apiUrl || !apiKey) throw new BadRequestException('请先在系统设置中配置 LLM API 地址与 API Key');

    const prompt = `你是一位工作考核评分员。请严格按照以下考核标准（Markdown 格式）对工作内容进行评分，为每项考核标准生成 0-100 分的分数和简短评语。

要求：仅依据考核标准中的条目逐项打分并写评语，不要添加标准以外的项目。只返回一个 JSON 数组，不要其他说明。
格式：[{"item_name":"考核项名称","score":分数,"comment":"简短评语"}]

【考核标准】（Markdown）\n${criteria}

【工作内容】\n${content}`;

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, temperature, top_p: topP, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new BadRequestException(`LLM 接口返回异常: ${res.status} ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content ?? '';
    const match = text.match(/\[[\s\S]*\]/);
    const scoreDetails: { item_name: string; score: number; comment: string }[] = [];
    if (match) {
      const arr = JSON.parse(match[0]) as { item_name: string; score: number; comment?: string }[];
      for (const c of arr) {
        scoreDetails.push({ item_name: c.item_name, score: Number(c.score) || 0, comment: c.comment ?? '' });
      }
    }
    const totalScore =
      scoreDetails.length > 0 ? scoreDetails.reduce((s, d) => s + d.score, 0) / scoreDetails.length : 0;
    const remark =
      scoreDetails.map((d) => (d.comment ? `${d.item_name}：${d.comment}` : '')).filter(Boolean).join('；') || '无评语';
    return { scoreDetails, totalScore, remark };
  }

  /** AI 生成岗位考核标准：根据部门、岗位及可选补充要求生成 Markdown 格式的考核标准（不落库） */
  async aiGenerateCriteria(departmentName: string, positionName: string, requirements?: string): Promise<{ content: string }> {
    const dept = (departmentName || '').trim();
    const pos = (positionName || '').trim();
    if (!dept || !pos) throw new BadRequestException('请提供部门名称与岗位名称');

    const all = await this.settings.getAll();
    const apiUrl = all.llm_api_url || process.env.LLM_API_URL;
    const apiKey = all.llm_api_key || process.env.LLM_API_KEY;
    const model = all.llm_model || process.env.LLM_MODEL || 'gpt-3.5-turbo';
    const temperature = Math.min(2, Math.max(0, parseFloat(all.llm_temperature ?? '0') || 0));
    const topP = Math.min(1, Math.max(0, parseFloat(all.llm_top_p ?? '1') || 1));
    if (!apiUrl || !apiKey) throw new BadRequestException('请先在系统设置中配置 LLM API 地址与 API Key');

    const extraReq = (requirements || '').trim();
    const requirementBlock = extraReq ? `\n补充要求（请在上述基础上结合以下要求生成）：\n${extraReq}\n` : '';

    const prompt = `你是一位人力资源与绩效考核专家。请为以下部门下的岗位编写考核标准。

要求：
- 部门：${dept}
- 岗位：${pos}
- 输出格式为 Markdown，包含若干考核维度（如工作质量、及时性、协作等），每个维度有标题和简要说明（可含评分要点或 0-100 分说明）。
- 内容简洁、可操作，便于后续对日报/周报进行评分。
- 直接输出 Markdown 正文，不要前置“考核标准”等总标题以外的多余说明。${requirementBlock}`;

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, temperature, top_p: topP, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new BadRequestException(`LLM 接口返回异常: ${res.status} ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = (data.choices?.[0]?.message?.content ?? '').trim();
    return { content: content || '生成结果为空' };
  }
}
