---
name: work-score-domain
description: Use when working with departments, positions, users, work records, work plans, scoring (AI/manual), score queue, or assessments/rankings. Encodes business rules and data model for the WorkScore platform.
---

# WorkScore 业务领域

## 何时使用

在涉及以下内容时应用本技能：部门/岗位/人员配置、工作记录（日报/周报）、工作计划、AI 或人工评分、考核队列、月度/年度排名与考核汇总。

## 数据模型概要

- **部门 (departments)** 1:N **岗位 (positions)**：岗位归属部门，考核标准在岗位的 `assessment_criteria`（JSON）中维护。
- **部门** 1:N **人员 (users)**，**岗位** N:1 **人员**：人员有所属部门与可选岗位。
- **人员** 1:N **工作记录 (work_records)**：每条记录有 `type`（daily/weekly）、`record_date`、`content`（Markdown）、`recorder_id`。
- **工作记录** 至多 1 条 **AI 评分**、多条 **人工评分**（每人每条记录至多一条）**评分记录 (score_records)**；含 `score_details`（JSON）、`total_score`、`remark`（人工必填）。
- **考核队列 (score_queue)**：待 AI 评分的记录入队，Worker 按序处理，状态 pending/processing/done/failed。
- **部门** 1:N **工作计划 (work_plans)**，**人员** 1:N **工作计划**：计划有 `user_id`（所属用户）、`creator_id`（创建人）、`executor_id`（执行人）、`department_id`、`priority`（high/medium/low）、`status`（pending/in_progress/completed/cancelled/on_hold/delayed）等。
- **月度/年度排名**：基于 `user_monthly_rankings`，按部门（及可选岗位）返回排名；每条含 **工作计划得分** `work_plan_score`、**周报得分** `weekly_report_score`、**总分** `total_score`。总分公式：`total_score = work_plan_score × 工作计划占比 + weekly_report_score × 周报占比`，占比在系统设置中配置（`work_plan_ratio_percent` 等）。脏数据表 `user_monthly_score_updates` 按 `(user_id, year_month, source_type)` 标记需刷新维度，`source_type` 为 `work_record`（周报）或 `work_plan`（工作计划）。

详细表结构与 ER 见项目 `docs/DESIGN.md` 第三节。

## 业务规则

### 工作记录唯一性

- **日报**：同一用户（recorder_id）同一天（record_date）仅能有一条；违反时返回 400，提示「当日已有日报」。
- **周报**：同一用户同一周仅能有一条；周的标识为该周**周一**的日期（YYYY-MM-DD），写入与校验时需将任意日期规范到当周周一（如 `getMondayOfWeek(recordDate)`）。违反时返回 400，提示「该周已有周报」。

实现参考：`backend/src/work-records/work-records.service.ts` 中的 `checkUniqueness`。

### 评分唯一性与权限

- 每条工作记录最多一条 AI 评分、多条人工评分（每人每条记录仅一条）；重复提交同类型（如本人已有人工评分）返回 **409** 或 400 并明确提示。
- **删除评分**：仅 **评分人本人**（scorer_id = 当前用户）可删除该条评分记录；删除后该工作记录可再次提交同类型评分。
- 工作记录的**修改/删除**：仅**记录人本人**（recorder_id = 当前用户）可执行。

### 岗位考核标准

- `positions.assessment_criteria` 为 JSON，结构可为 `[{ "name", "weight", "description" }, ...]`。AI 评分与人工评分均按**记录人岗位**取考核项；若记录人无岗位，AI 可能写 0 分待人工复核。

### 工作计划权限

- **查看**：登录用户可查看所属部门内（`department_id = 当前用户.departmentId`）的所有计划。
- **新建**：可为自己或同部门其他用户创建；`creator_id` 固定当前用户；`user_id` 可选指定同部门用户（默认当前用户）。
- **修改/删除**：仅当 `user_id = 当前用户`（所属用户）或 `executor_id = 当前用户`（执行人）时允许。
- 实现参考：`backend/src/work-plans/work-plans.service.ts`。

### 考核占比与总分

- **周报内**：单条工作记录总成绩 = AI 总分 × `llm_assessment_weight_percent`/100 + 人工平均 × (1 − 该占比)；仅有一种评分时取该分数。
- **月度总分**：`total_score = work_plan_score × work_plan_ratio_percent/100 + weekly_report_score × (100 − work_plan_ratio_percent)/100`。周报得分 = 该月工作记录总成绩平均；工作计划得分 = 该月工作计划完成度 AI 打分（`RankingRefreshProcessor.computeWorkPlanScore`）。变更工作计划时需调用 `ScoresService.markWorkPlanScoreDirty(userId, yearMonth)` 写入 `user_monthly_score_updates(source_type='work_plan')` 以触发重算。

### 考核队列与 AI 评分

- 新建工作记录后自动插入 `score_queue(status='pending')`。
- 后台 Worker（如 `ScoreQueueProcessor`）轮询取 pending，置为 processing，按记录人岗位的 assessment_criteria 拼 prompt 调用 LLM（使用系统设置中的 temperature、top_p），解析 JSON 写入 `score_records(score_type='ai')`，更新队列为 done；失败则 status='failed' 并记录 error_message。失败项可按配置间隔重试（重置为 pending）。

## 参考

- 完整设计与 API：`docs/DESIGN.md`（第三节数据库、第六节核心业务流程）。
- 实现：`backend/src/work-records/`、`backend/src/work-plans/`、`backend/src/scores/`（含 score-queue.processor）、`backend/src/assessments/`。
