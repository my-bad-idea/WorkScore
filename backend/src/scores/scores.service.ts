import { createHash } from 'node:crypto';
import { Injectable, NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../config/database.service';
import { SettingsService } from '../settings/settings.service';

/** 工作内容评分 Prompt 版本，用于缓存 key，Prompt 变更时需递增以失效旧缓存 */
const LLM_SCORING_PROMPT_VERSION = '3';
/** 评分一致性：固定 seed 配合 temperature=0 降低随机性（部分 API 支持） */
const LLM_SCORING_SEED = 42;

@Injectable()
export class ScoresService {
  /** 相同输入复用评分结果，避免重复调用导致的波动；key = hash(考核标准+工作内容+Prompt版本) */
  private readonly scoreCache = new Map<string, { scoreDetails: { item_name: string; score: number; comment: string }[]; totalScore: number }>();

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

  /**
   * 工作内容归一化：统一标点、空白、语气词、无意义词与句段顺序，使语义相同的周报得到相同缓存 key 与 prompt，从而评分一致。
   * 规则：
   * 1. 句段排序：按。；换行 切分为句段，去掉句首顺序词（首先/然后/接着等）后按字典序排序，使「A。B。」与「B。A。」等价。
   * 2. 标点与空白：常见分隔标点（，。；、）与任意空白统一为单空格并折叠。
   * 3. 语气词：去掉常见语气词（呢啊吧哦嘛啦呀哇哟呗咧）。
   * 4. 无意义/填充词：去掉「一下」「等等」；将「进行了」「做了」统一为「完成了」。
   */
  private normalizeWorkContentForScoring(content: string): string {
    let s = content.trim();
    if (!s) return '';

    // 1. 按句/段切分，去掉句首顺序词后排序，消除仅顺序不同带来的差异
    const segmentBoundary = /[。；\n]+/;
    const orderWordPrefix = /^(首先|然后|接着|随后|最后|其一|其二|另外|此外)\s*/;
    const segments = s
      .split(segmentBoundary)
      .map((seg) => seg.replace(orderWordPrefix, '').trim())
      .filter(Boolean);
    if (segments.length > 0) {
      segments.sort((a, b) => a.localeCompare(b, 'zh-CN'));
      s = segments.join(' ');
    }

    // 2. 标点与空白归一化
    s = s.replace(/[\s，。；、]+/g, ' ').replace(/\s+/g, ' ').trim();
    // 3. 语气词
    s = s.replace(/[呢啊吧哦嘛啦呀哇哟呗咧]/g, '');
    // 4. 无意义/填充词
    s = s.replace(/一下/g, '');
    s = s.replace(/等等/g, '');
    s = s.replace(/进行了/g, '完成了');
    s = s.replace(/做了/g, '完成了');
    s = s.replace(/\s+/g, ' ').trim();
    return s;
  }

  /**
   * 工作内容评分缓存 key：考核标准 + 归一化后工作内容 + Prompt 版本，Prompt 变更后旧缓存自动失效。
   */
  private getScoreCacheKey(criteria: string, normalizedContent: string): string {
    return createHash('sha256')
      .update(criteria + '\n' + normalizedContent + '\n' + LLM_SCORING_PROMPT_VERSION)
      .digest('hex');
  }

  /**
   * 构建工作考核评分的 Prompt：结构化输出 + 评分量表说明 + Few-shot 示例，提升一致性。
   */
  private buildWorkScorePrompt(
    criteria: string,
    content: string,
    context?: { departmentName?: string | null; positionName?: string | null },
  ): string {
    const contextLines: string[] = [];
    if (context?.departmentName) contextLines.push(`部门：${context.departmentName}`);
    if (context?.positionName) contextLines.push(`岗位：${context.positionName}`);
    const contextBlock =
      contextLines.length > 0 ? `【被考核人信息】\n${contextLines.join('\n')}\n\n` : '';

    return `你是一位工作考核评分员。请严格按照下方【考核标准】对工作内容进行评分。

## 评分规则
- 仅依据考核标准中的条目逐项打分，考核项名称、分数区间及判定规则均以【考核标准】为准，不要自行增删或改写。
- 每项 0-100 分，须给出每项简短评语（扣分理由或亮点）。
- 只返回一个 JSON 数组，不要任何其他说明或 markdown 标记。

## 输出格式（严格遵循）
[{"item_name":"考核项名称","score":数字,"comment":"简短评语"}]

## 参考示例
【示例一】工作内容较笼统时：
周报内容："本周做了一些开发工作。"
→ [{"item_name":"工作完成度","score":20,"comment":"描述过于笼统，无具体产出与事项"}]

【示例二】工作内容具体时：
周报内容："本周完成用户模块接口开发与单元测试，修复登录超时问题 3 个，下周计划完成权限模块。"
→ [{"item_name":"工作完成度","score":90,"comment":"事项具体，有产出描述与问题修复"}]

${contextBlock}【考核标准】（Markdown）
${criteria}

【工作内容】（已做标点、空白、语气词与无意义词及句段顺序归一化，请仅按语义评分。）
${content}`;
  }

  /**
   * 调用 LLM 对工作内容按考核标准评分（temperature=0 + seed 保证一致性，支持缓存）。
   * 供 AI 考核测试与考核队列共用。
   */
  async scoreWorkContentWithLlm(
    criteriaMarkdown: string,
    workContent: string,
    options?: {
      timeoutMs?: number;
      context?: { departmentName?: string | null; positionName?: string | null };
    },
  ): Promise<{ scoreDetails: { item_name: string; score: number; comment: string }[]; totalScore: number; remark: string }> {
    const criteria = criteriaMarkdown.trim();
    const rawContent = workContent.trim().slice(0, 3000);
    if (!criteria) throw new BadRequestException('请输入或选择考核标准');
    if (!rawContent) throw new BadRequestException('请输入周报/日报内容');

    const normalizedContent = this.normalizeWorkContentForScoring(rawContent);
    if (!normalizedContent) throw new BadRequestException('请输入周报/日报内容');

    const all = await this.settings.getAll();
    const apiUrl = all.llm_api_url || process.env.LLM_API_URL;
    const apiKey = all.llm_api_key || process.env.LLM_API_KEY;
    const model = all.llm_model || process.env.LLM_MODEL || 'gpt-3.5-turbo';
    if (!apiUrl || !apiKey) throw new BadRequestException('请先在系统设置中配置 LLM API 地址与 API Key');

    const cacheKey = this.getScoreCacheKey(criteria, normalizedContent);
    const cached = this.scoreCache.get(cacheKey);
    if (cached) {
      const remark =
        cached.scoreDetails.map((d) => (d.comment ? `${d.item_name}：${d.comment}` : '')).filter(Boolean).join('；') || '无评语';
      return { ...cached, remark };
    }

    const prompt = this.buildWorkScorePrompt(criteria, normalizedContent, options?.context);
    const topK = Math.max(1, parseInt(all.llm_top_k ?? '1', 10) || 1);
    const stream = all.llm_stream === 'true';
    const body: Record<string, unknown> = {
      model,
      temperature: 0,
      top_p: 1,
      top_k: topK,
      stream,
      seed: LLM_SCORING_SEED,
      messages: [{ role: 'user', content: prompt }],
    };

    const controller = new AbortController();
    const timeoutId = options?.timeoutMs ? setTimeout(() => controller.abort(), options.timeoutMs) : undefined;
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (timeoutId) clearTimeout(timeoutId);
    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      throw new BadRequestException(`LLM 接口返回异常: ${res.status} ${bodyText.slice(0, 200)}`);
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content ?? '';
    const match = text.match(/\[[\s\S]*\]/);
    const scoreDetails: { item_name: string; score: number; comment: string }[] = [];
    if (match) {
      const arr = JSON.parse(match[0]) as { item_name: string; score: number; comment?: string }[];
      for (const c of arr) {
        const rawScore = Number(c.score) || 0;
        scoreDetails.push({
          item_name: c.item_name,
          score: Math.min(100, Math.max(0, rawScore)),
          comment: c.comment ?? '',
        });
      }
    }
    const totalScore =
      scoreDetails.length > 0 ? scoreDetails.reduce((s, d) => s + d.score, 0) / scoreDetails.length : 0;
    const remark =
      scoreDetails.map((d) => (d.comment ? `${d.item_name}：${d.comment}` : '')).filter(Boolean).join('；') || '无评语';
    this.scoreCache.set(cacheKey, { scoreDetails, totalScore });
    return { scoreDetails, totalScore, remark };
  }

  /** AI 考核测试：根据考核标准与工作内容调用 LLM 返回评分与评语（不落库） */
  async aiTest(criteriaMarkdown: string, workContent: string): Promise<{ scoreDetails: { item_name: string; score: number; comment: string }[]; totalScore: number; remark: string }> {
    return this.scoreWorkContentWithLlm(criteriaMarkdown, workContent);
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
    const topK = Math.max(1, parseInt(all.llm_top_k ?? '1', 10) || 1);
    const stream = all.llm_stream === 'true';
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
      body: JSON.stringify({
        model,
        temperature,
        top_p: topP,
        top_k: topK,
        stream,
        messages: [{ role: 'user', content: prompt }],
      }),
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
