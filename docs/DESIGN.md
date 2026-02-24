# 工作智能评分平台 - 完整设计与实施计划

面向开发：架构、模块与 API 约定。部署与环境变量见 [DEPLOY.md](DEPLOY.md)。

## 一、项目概述

### 1.1 目标
构建一个支持日报/周报录入、AI 与人工双通道考核、按部门/岗位标准评分的智能工作评分平台。

### 1.2 技术栈
| 层级 | 技术选型 | 说明 |
|------|----------|------|
| 后端 | **NestJS** (Node.js + TypeScript) | 模块化、依赖注入、内置守卫/管道 |
| 前端 | **React + Vite** + Ant Design | Vite 构建，支持深色/浅色主题切换 |
| 数据库 | SQLite | 单文件，易部署 |
| 认证 | JWT | 登录令牌，可配置过期时间 |
| AI 评分 | 开放 API（如 OpenAI/国产大模型） | 异步队列调用 LLM |

---

## 二、系统架构

### 2.1 整体架构图（逻辑）

```
┌─────────────────────────────────────────────────────────────────┐
│           前端 (React + Vite + Ant Design，深色/浅色主题)         │
│  安装向导 | 登录 | 系统配置(部门/岗位/人员/设置) | 工作记录 | 考核 │
└───────────────────────────────┬─────────────────────────────────┘
                                │ HTTPS / REST API
┌───────────────────────────────▼─────────────────────────────────┐
│                      后端 (NestJS)                               │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌────────────┐ │
│  │ 认证/鉴权   │ │ 系统配置API │ │ 工作记录API │ │ 考核/排名  │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └────────────┘ │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ 考核队列 + AI 评分 Worker（按顺序调用 LLM）                    ││
│  └─────────────────────────────────────────────────────────────┘│
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│                      SQLite 数据库                               │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 目录结构建议

```
WorkScore/
├── backend/                      # 后端 (NestJS)
│   ├── src/
│   │   ├── app.module.ts
│   │   ├── main.ts
│   │   ├── common/               # 守卫、管道、装饰器、过滤器
│   │   ├── config/               # 配置模块（DB、JWT、LLM）
│   │   ├── auth/                 # 认证模块（登录、改密、JWT 策略）
│   │   ├── setup/                # 安装向导（首次创建管理员）
│   │   ├── departments/          # 部门模块
│   │   ├── positions/            # 岗位模块（含考核标准）
│   │   ├── users/                # 人员模块
│   │   ├── settings/             # 系统设置模块
│   │   ├── work-records/         # 工作记录模块
│   │   ├── scores/               # 评分与考核队列
│   │   └── assessments/          # 月度/年度排名
│   ├── package.json
│   └── tsconfig.json
├── frontend/                     # 前端 (React + Vite + Ant Design)
│   ├── src/
│   │   ├── api/                  # 请求封装
│   │   ├── components/           # 通用组件
│   │   ├── theme/                # 深色/浅色主题配置与切换
│   │   ├── layouts/
│   │   ├── pages/                # 含安装向导页、登录、各业务页
│   │   ├── stores/
│   │   ├── utils/
│   │   └── App.tsx
│   ├── package.json
│   └── vite.config.ts
├── docs/
│   └── DESIGN.md
└── README.md
```

---

## 三、数据库设计

### 3.1 ER 关系概要
- **部门** 1:N **岗位**（岗位归属部门，岗位内维护考核标准）
- **部门** 1:N **人员**，**岗位** N:1 **人员**（人员所属部门 + 所属岗位）
- **人员** 1:N **工作记录**
- **工作记录** 至多 1 条 **AI 评分**、多条 **人工评分**（每人每条记录至多一条；评分人可删自己的评分；人工评分说明必填）
- **部门** + **人员** + **时间维度** → **月度/年度考核汇总与排名**（汇总表含周报得分、工作计划得分、总分，由后台按配置占比刷新）
- **部门** 1:N **工作计划**，**人员** 1:N **工作计划**（计划归属用户 + 部门；另有创建人、执行人）；计划变更会标记对应用户月份的「工作计划」脏数据以触发重算
- **user_monthly_score_updates**：按 (user_id, year_month, source_type) 标记需刷新的维度，source_type 为 `work_record`（周报）或 `work_plan`（工作计划）
- **安装状态**：无用户时视为未安装，需走安装向导创建管理员。

### 3.2 表结构（SQLite）

```sql
-- 系统设置（键值对，含令牌过期时间等）
CREATE TABLE system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT
);

-- 部门（不再包含考核标准，考核标准下沉到岗位）
CREATE TABLE departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  created_at TEXT,
  updated_at TEXT
);

-- 岗位（归属部门，考核标准在此维护）
CREATE TABLE positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  department_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  assessment_criteria TEXT NOT NULL,  -- JSON: [{ name, weight, description }, ...]
  enabled INTEGER DEFAULT 1,
  created_at TEXT,
  updated_at TEXT,
  FOREIGN KEY (department_id) REFERENCES departments(id)
);

-- 人员（含角色、所属岗位；角色：system_admin | department_admin | user）
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  real_name TEXT NOT NULL,
  department_id INTEGER NOT NULL,
  position_id INTEGER,
  is_admin INTEGER DEFAULT 0,
  role TEXT NOT NULL DEFAULT 'user',
  enabled INTEGER DEFAULT 1,
  created_at TEXT,
  updated_at TEXT,
  FOREIGN KEY (department_id) REFERENCES departments(id),
  FOREIGN KEY (position_id) REFERENCES positions(id)
);

-- 工作记录（日报/周报）；业务规则：每人每天仅一条日报、每人每周仅一条周报
CREATE TABLE work_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,           -- 'daily' | 'weekly'
  record_date TEXT NOT NULL,   -- 日报：YYYY-MM-DD；周报：该周周一日期 YYYY-MM-DD
  content TEXT NOT NULL,       -- Markdown
  recorder_id INTEGER NOT NULL,
  created_at TEXT,
  updated_at TEXT,
  FOREIGN KEY (recorder_id) REFERENCES users(id)
);

-- 评分记录（单条：某工作记录的一次评分；每条记录最多一条 AI，人工评分可多条、同一 scorer 每条记录仅一条）
CREATE TABLE score_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_record_id INTEGER NOT NULL,
  scorer_id INTEGER NOT NULL,
  score_type TEXT NOT NULL,    -- 'ai' | 'manual'
  score_details TEXT NOT NULL, -- JSON: [{ item_name, score, comment }, ...]
  total_score REAL,
  remark TEXT,                 -- 评分说明（选填）
  scored_at TEXT,
  FOREIGN KEY (work_record_id) REFERENCES work_records(id),
  FOREIGN KEY (scorer_id) REFERENCES users(id)
);
-- 唯一约束：同一工作记录仅一条 AI 评分；人工评分可多条、每人每条记录仅一条
CREATE UNIQUE INDEX idx_score_records_ai_unique ON score_records(work_record_id) WHERE score_type = 'ai';
CREATE UNIQUE INDEX idx_score_records_manual_user_unique ON score_records(work_record_id, scorer_id) WHERE score_type = 'manual';

-- 考核队列（待 AI 评分）
CREATE TABLE score_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_record_id INTEGER NOT NULL UNIQUE,
  status TEXT DEFAULT 'pending',
  created_at TEXT,
  processed_at TEXT,
  error_message TEXT,
  FOREIGN KEY (work_record_id) REFERENCES work_records(id)
);

-- 唯一约束：日报每人每天一条；周报每人每周一条（record_date 存该周周一，应用层写入时统一）
CREATE UNIQUE INDEX idx_work_records_daily_unique  ON work_records(recorder_id, record_date) WHERE type = 'daily';
CREATE UNIQUE INDEX idx_work_records_weekly_unique ON work_records(recorder_id, record_date) WHERE type = 'weekly';

CREATE INDEX idx_work_records_recorder_date ON work_records(recorder_id, record_date);
CREATE INDEX idx_work_records_type ON work_records(type);
CREATE INDEX idx_score_records_work ON score_records(work_record_id);
CREATE INDEX idx_score_queue_status ON score_queue(status);

-- 工作计划（部门内可查看，可为同部门他人创建；仅所属用户或执行人可修改/删除）
CREATE TABLE work_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,         -- 计划所属用户
  creator_id INTEGER NOT NULL,      -- 创建人（实际创建的用户）
  department_id INTEGER NOT NULL,   -- 所属部门
  executor_id INTEGER,              -- 执行人（可空）
  system TEXT,                      -- 系统
  module TEXT,                      -- 模块
  plan_content TEXT NOT NULL,       -- 计划内容
  planned_start_at TEXT,            -- 计划开始时间
  planned_end_at TEXT,              -- 计划结束时间
  planned_duration_minutes INTEGER, -- 计划时长（分钟）
  actual_start_at TEXT,             -- 实际开始时间
  actual_end_at TEXT,               -- 实际结束时间
  actual_duration_minutes INTEGER,  -- 实际时长（分钟）
  priority TEXT NOT NULL DEFAULT 'medium', -- high / medium / low
  status TEXT NOT NULL DEFAULT 'pending',  -- pending / in_progress / completed / cancelled / on_hold / delayed
  remark TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (creator_id) REFERENCES users(id),
  FOREIGN KEY (department_id) REFERENCES departments(id),
  FOREIGN KEY (executor_id) REFERENCES users(id)
);
CREATE INDEX idx_work_plans_user_status ON work_plans(user_id, status);
CREATE INDEX idx_work_plans_department ON work_plans(department_id);
CREATE INDEX idx_work_plans_executor ON work_plans(executor_id);
CREATE INDEX idx_work_plans_creator ON work_plans(creator_id);

-- 月度排名汇总表（按用户、月份；总分 = 工作计划得分×占比 + 周报得分×占比）
CREATE TABLE user_monthly_rankings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  year_month TEXT NOT NULL,
  department_id INTEGER NOT NULL,
  position_id INTEGER,
  avg_score REAL NOT NULL DEFAULT 0,       -- 周报平均（与 weekly_report_score 一致）
  record_count INTEGER NOT NULL DEFAULT 0,
  score_sum REAL NOT NULL DEFAULT 0,      -- 周报得分之和
  work_plan_score REAL DEFAULT 0,         -- 工作计划完成度得分（0–100，AI 打分）
  weekly_report_score REAL DEFAULT 0,     -- 周报月均分
  total_score REAL DEFAULT 0,             -- 排名用总分 = work_plan_score*占比 + weekly_report_score*占比
  updated_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE UNIQUE INDEX idx_umr_user_month ON user_monthly_rankings(user_id, year_month);

-- 月度刷新脏标记（按来源区分：工作记录变更标 work_record，工作计划变更标 work_plan）
CREATE TABLE user_monthly_score_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  year_month TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'work_record',  -- 'work_record' | 'work_plan'
  last_updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE UNIQUE INDEX idx_umsu_user_month_type ON user_monthly_score_updates(user_id, year_month, source_type);
```

实现中索引名与迁移逻辑见 `backend/src/config/database.service.ts`（如 `idx_umsu_user_month` 已弃用，改用 `idx_umsu_user_month_type`）。

说明：
- **岗位考核标准**：`positions.assessment_criteria` 存 JSON，如 `[{ "name": "完成度", "weight": 0.3, "description": "..." }, ...]`。AI 评分与人工评分均按当前记录人的岗位取考核项。
- **工作记录唯一性**：日报按 `(recorder_id, record_date)` 唯一；周报的 `record_date` 统一存该周**周一**的日期。新增/编辑时后端校验并返回明确错误。
- **评分唯一性**：同一工作记录最多一条 AI 评分；人工评分可多人提交、每人每条记录仅一条（同一 work_record_id + scorer_id + score_type='manual' 唯一）。不能给自己的记录评分。提交本人已评过的记录时返回 409。评分人可**删除自己的评分记录**（仅 `scorer_id = 当前用户` 可删）。
- **评分说明**：`score_records.remark` 人工评分为必填；AI 评分可带说明。
- **单条工作记录总成绩**：该记录下 AI 与人工评分按系统设置「周报内 AI 占比」加权（AI 总分×占比 + 人工平均×(1−占比)），再参与月度/年度统计。
- **月度排名总分**：`total_score = work_plan_score × 工作计划占比 + weekly_report_score × 周报占比`；周报得分为该月工作记录总成绩平均，工作计划得分为该月计划完成度 AI 打分。占比在系统设置中配置（如 `work_plan_ratio_percent`、`llm_assessment_weight_percent`）。

---

## 四、后端 API 设计

### 4.1 安装向导（仅未安装时可用）
- `GET /api/setup/status` — 返回 `{ installed: boolean }`（无任何用户或无管理员时为未安装）。
- `POST /api/setup/init` — 未安装时调用：创建初始管理员（body: `username`, `password`, `realName`），初始化 system_settings，返回成功后视为已安装。安装后仅能通过登录使用。

### 4.2 认证
- `POST /api/auth/login` — 登录，返回 JWT；过期时间从 `system_settings` 读。
- `POST /api/auth/change-password` — 修改当前用户密码（需旧密码）。
- `GET /api/auth/me` — 当前用户信息（含部门、岗位、角色 role：system_admin | department_admin | user）。

### 4.3 系统配置（按角色控制）
- **部门**：`GET` 所有登录用户可读；`POST/PUT/DELETE` 仅 **系统管理员**（role=system_admin）。
- **岗位**：`GET` 所有登录用户可读；`POST/PUT/DELETE` **系统管理员** 全部可写，**部门管理员** 仅可写本部门（department_id = 当前用户 departmentId）下的岗位。
- **人员**：`GET` 所有登录用户可读；`POST/PUT/DELETE` **系统管理员** 全部可写，**部门管理员** 仅可写本部门下人员（创建时部门固定为本部门）。
- **设置**：`GET`、`PUT` 仅 **系统管理员** 可访问。
- **考核队列** `GET /api/score-queue`、**AI 考核测试** `POST /api/scores/ai-test` 等：仅 **系统管理员** 与 **部门管理员** 可访问。

### 4.4 工作记录
- `GET /api/work-records` — 列表（支持按类型、日期、记录人筛选）
- `POST /api/work-records` — 新增；**校验**：日报每人每天仅一条、周报每人每周仅一条（周以 record_date 所在周周一为准），违反则 4xx + 明确提示。
- `GET /api/work-records/:id` — 详情
- `PUT /api/work-records/:id` — 仅记录人可改（改日期时仍校验唯一性）
- `DELETE /api/work-records/:id` — 仅记录人可删

### 4.5 工作计划
- `GET /api/work-plans` — 列表：返回当前用户所属部门内所有计划；支持 query：`status`、`priority`、`executorId`、`userId`（所属用户）、`plannedStartFrom`、`plannedStartTo`。
- `GET /api/work-plans/:id` — 详情；仅当计划所属部门与当前用户部门一致可访问。
- `POST /api/work-plans` — 新增；body 可选 `userId`（计划所属用户，须同部门，默认当前用户）；`creator_id` 固定为当前用户。
- `PUT /api/work-plans/:id` — 更新；仅计划所属用户（`user_id`）或执行人（`executor_id`）可改。
- `DELETE /api/work-plans/:id` — 删除；同上权限。
- 状态枚举：`pending` 待开始、`in_progress` 执行中、`completed` 已完成、`cancelled` 已取消、`on_hold` 已搁置、`delayed` 已延期。
- 优先级枚举：`high` 高、`medium` 中、`low` 低。

### 4.6 工作考核
- `GET /api/work-records/:id/scores` — 某条工作记录的所有评分（一条 AI + 多条人工，含评分说明）
- `GET /api/work-records/:id/criteria` — 该记录对应记录人岗位的考核标准（供人工评分表单使用）
- `POST /api/work-records/:id/scores` — 提交人工评分（JSON：评分项、分数、**总分 totalScore**、**评分说明 remark**，二者均为必填）；不能给自己评分；每人每条记录只能评一次，重复提交返回 409
- `DELETE /api/score-records/:id` — 删除评分记录；**仅评分人本人**（scorer_id = 当前用户）可删
- `GET /api/score-queue` — 考核队列列表（待处理/处理中/已完成/失败），支持分页筛选；**仅系统管理员与部门管理员**可访问
- `POST /api/scores/ai-test` — AI 考核测试（body: criteriaMarkdown, workContent）；仅系统/部门管理员可访问
- `POST /api/scores/ai-generate-criteria` — 根据部门名、岗位名与可选需求描述生成考核标准草稿（供岗位配置使用）；仅系统/部门管理员可访问
- 总成绩：`GET /api/work-records/:id/summary` — 对至多两条评分聚合

### 4.7 排名与报表
- `GET /api/assessments/monthly` — 按月个人考核（参数：year, month；可选 departmentId、positionId；按部门排名）
- `GET /api/assessments/yearly` — 按年个人考核（参数：year；可选 departmentId、positionId）
- 返回结构：`{ departmentId, departmentName, rankings: [{ userId, userName, score, workPlanScore, weeklyReportScore, rank, positionName? }] }`；`score` 为总分（排名依据），`workPlanScore`、`weeklyReportScore` 用于展示。
- **首页用**：传当前用户所属 `departmentId` + 当前月/年，即“所属部门评分排名”

### 4.8 权限约定
- 安装接口：仅当 `GET /api/setup/status` 为未安装时可调用 `POST /api/setup/init`；已安装后不再暴露或返回 403。
- 其余 API（除登录、安装）需 JWT。
- **角色**：`system_admin`（系统管理员）、`department_admin`（部门管理员）、`user`（普通用户）。部门管理员仅可维护本部门（department_id = 当前用户 departmentId）下的岗位与人员；系统设置、考核队列、AI 考核测试仅系统管理员与部门管理员可访问（系统设置仅系统管理员）。
- 部门写操作：仅 `role = 'system_admin'`。岗位/人员写操作：系统管理员无限制，部门管理员仅限本部门资源。
- 工作记录修改/删除：仅 `recorder_id = 当前用户`。
- 评分记录删除：仅 `scorer_id = 当前用户`。
- **工作计划**：部门内所有登录用户可查看本部门计划；可为同部门他人创建计划（`creator_id` 固定当前用户）；修改/删除仅当 `user_id = 当前用户` 或 `executor_id = 当前用户`。

---

## 五、前端模块设计

### 5.1 主题（深色 / 浅色 / 跟随系统）
- 使用 **Ant Design 5** 的 ConfigProvider + 主题变量（如 `token.colorBgContainer`、`token.colorText`），配合 CSS 变量或 theme 包维护两套 token。
- 主题偏好存入本地存储（如 `localStorage.theme = 'light' | 'dark' | 'system'`），启动时读取并应用；提供全局切换入口（如顶栏图标/下拉），支持浅色、深色、跟随系统三种选项。
- 深色主题：`algorithm: theme.darkAlgorithm`；浅色：`algorithm: theme.defaultAlgorithm`。保证列表、表单、弹窗在两种主题下均可读。

### 5.2 路由与页面
- `/setup` — **安装向导**：仅在未安装时可访问；表单输入管理员账号、密码、姓名，提交后调用 `POST /api/setup/init`，成功后跳转登录。若已安装则重定向到 `/login` 或 `/`。
- `/login` — 登录
- **`/`（首页）** — **所属部门评分排名**：展示当前用户所在部门的当月（或可选月/年）排名，含工作计划得分、周报得分、总分；默认即部门排名页，无需再跳转。
- `/work-records` — 工作记录列表（筛选、新建、编辑、删除）；新建时前端可提示“每人每天仅一条日报、每人每周仅一条周报”。
- `/work-records/:id` — 记录详情 + 评分列表（一条 AI + 多条人工，展示评分说明；**评分人可删自己的评分**）+ 人工评分入口（若当前用户已评过则隐藏）；人工评分表单含**总分**与**评分说明（均必填）**，根据 criteria 动态生成评分项。
- `/work-plans` — **工作计划**列表（部门内全部计划，支持筛选状态/优先级/执行人/所属用户/时间范围；新建/编辑/删除）。
- `/assessments` — 考核与排名（Tab：月度排名 / 年度排名，可切换部门、月/年；表格含工作计划得分、周报得分、总分）
- **`/score-queue`** — **考核队列查看**：列表展示待处理/处理中/已完成/失败，可筛状态、时间；支持跳转对应工作记录详情。
- `/system` — 系统配置（仅管理员可见或可编辑）
  - `/system/departments` — 部门 CRUD
  - `/system/positions` — **岗位 CRUD**（归属部门、考核标准 JSON 编辑）
  - `/system/users` — 人员 CRUD（含岗位选择）、修改密码入口
  - `/system/ai-test` — AI 考核测试（仅系统/部门管理员）
  - `/system/settings` — 令牌过期时间等设置（仅系统管理员）
- `/profile` — 个人信息；`/change-password` — 修改当前用户密码

### 5.3 状态与权限
- 全局：当前用户信息（含 departmentId、**role**）、token、**主题模式**；路由守卫：未登录跳转登录；未安装可放行 `/setup`，已安装访问 `/setup` 则重定向。按 role 控制菜单与页面：智能考核队列、AI考核测试仅 system_admin/department_admin；系统设置仅 system_admin；岗位/人员编辑：部门管理员仅本部门。
- 系统配置写操作：部门仅系统管理员；岗位/人员按角色与部门校验。
- 工作记录列表：仅记录人显示“编辑/删除”。
- 评分列表：仅**评分人本人**对每条评分显示“删除”；若已存在同类型评分则人工评分按钮隐藏或禁用。

### 5.4 关键组件
- **首页（所属部门排名）**：取当前用户 departmentId，请求当月（或可选月/年）部门排名，表格展示名次、姓名、分数；可快捷切换月份/年度。
- **安装向导页**：单页表单（管理员账号、密码、姓名），提交前校验，错误提示友好。
- 工作记录表单：类型（日报/周报）、所属日期（周报可选周一日期或日期选择器自动转周一）、Markdown 编辑器。
- 岗位表单：部门选择、岗位名称、考核标准（可 JSON 编辑或结构化表单项列表）。
- 考核标准展示：从岗位接口/记录人岗位读取，人工评分表单按项打分，并含**总分**与**评分说明（均必填）**。
- 评分列表：展示 AI/人工、总分、**评分说明**、评分人、时间；仅评分人显示删除按钮。
- **考核队列页**：表格列如工作记录摘要、类型、记录人、状态（pending/processing/done/failed）、入队时间、处理完成时间、错误信息；支持按状态筛选、分页；行可点击进入工作记录详情。
- 排名表格：Ant Design Table，支持按部门、月份/年份筛选；样式随主题切换。

---

## 六、核心业务流程

### 6.1 软件安装（首次）
1. 部署后访问前端，若 `GET /api/setup/status` 返回 `installed: false`，则展示安装向导页（如 `/setup`）。
2. 用户输入管理员账号、密码、姓名，提交 `POST /api/setup/init`。
3. 后端创建首条用户（is_admin=1，role=system_admin），写入 system_settings 默认值（如 token 过期时间），返回成功。
4. 前端跳转登录页；此后 `GET /api/setup/status` 返回 `installed: true`，安装接口不再可用。

### 6.2 上传日报/周报并触发 AI 评分
1. 用户提交工作记录 → `POST /api/work-records`。后端**校验唯一性**：日报同人同日仅一条、周报同人同周仅一条（周以 record_date 所在周周一为准），违反则 400 + 提示。
2. 通过后写入 `work_records`，并插入 `score_queue(status=pending)`。
3. 后台 Worker 轮询或事件驱动：取队首 `pending`，置为 `processing`，根据**记录人岗位**读取 `positions.assessment_criteria`，拼 prompt 调用 LLM，解析得分写入 `score_records(score_type=ai)`，更新队列状态为 `done`（失败则 `failed` + error_message）。

### 6.3 人工评分与评分说明
1. 用户在工作记录详情页点击“人工评分”（若当前用户已对该记录评过分则不再展示入口），请求 `GET /api/work-records/:id/criteria` 得到该记录人**岗位**的考核项，展示表单；表单含**总分**与**评分说明（均必填）**。
2. 提交 `POST /api/work-records/:id/scores`（body 含 scoreDetails、**totalScore**、**remark**，后二者必填）；不能给自己评分；每人每条记录只能评一次，重复则 409，否则写入 `score_records(score_type=manual)`。
3. **删除评分**：评分人可调用 `DELETE /api/score-records/:id` 删除自己的评分；同一工作记录同类型（AI/人工）只能各有一条，删除后可再次提交该类型评分。

### 6.4 多评分汇总与月度/年度排名
- **单条工作记录总成绩**：该记录有一条 AI 评分（若有）与多条人工评分（若有）。**当同时存在 AI 与人工评分时**，按系统配置 `llm_assessment_weight_percent`（周报内 AI 占比，默认 80%）加权：`总成绩 = AI总分×AI占比 + 人工平均分×(1-AI占比)`；仅有一种时取该分数；多条人工评分取平均后参与加权。
- **月度刷新**：后台 `RankingRefreshProcessor` 按 `user_monthly_score_updates` 的脏数据（`source_type` 为 `work_record` 或 `work_plan`）对每个 (user_id, year_month) 重算：**周报得分** = 该月各工作记录总成绩的平均；**工作计划得分** = 该月工作计划完成度 AI 打分（0–100，失败或无计划为 0）；**总分** = `work_plan_score × (work_plan_ratio_percent/100) + weekly_report_score × (1 - work_plan_ratio_percent/100)`。写入 `user_monthly_rankings` 的 `work_plan_score`、`weekly_report_score`、`total_score` 等。
- **月度排名**：按 `total_score` 降序；API 返回 `score`（总分）、`workPlanScore`、`weeklyReportScore` 供前端展示。
- **年度排名**：按该年各月 `total_score` 的聚合（如平均）排序；同样返回工作计划得分、周报得分与总分。
- **首页**：默认展示当前用户所属部门的当月排名（含工作计划得分、周报得分、总分）。

---

## 七、实施计划（分阶段）

### 阶段一：基础框架与安装、认证（约 1 周）
- 初始化 **NestJS** backend（SQLite，使用 **node:sqlite**）、**Vite + React + Ant Design** frontend。
- SQLite 建表与迁移（含 departments、positions、users、work_records、score_records 含 remark、score_queue、system_settings；score_records 唯一约束 work_record_id+score_type）。
- **安装向导**：`GET/POST /api/setup`，未安装时创建管理员；前端 `/setup` 页、安装状态检测与路由重定向。
- 实现登录、JWT（过期时间从 system_settings 读）、修改个人密码、`GET /api/auth/me`（含 departmentId）。
- 前端：登录页、主布局、**首页为所属部门评分排名**（/ 即部门排名，默认当月）、路由守卫（未安装→/setup，未登录→/login）、调用 me；**主题**：深色/浅色切换、持久化、ConfigProvider 注入。

### 阶段二：系统配置（约 1 周）
- 部门 CRUD、**岗位 CRUD**（含考核标准 JSON）、人员 CRUD（含岗位字段，密码 hash）；系统设置 CRUD；权限：仅管理员可写。
- 前端：部门管理、**岗位管理**（列表、表单含考核标准编辑）、人员管理（岗位选择）、设置页；列表/表单/删除确认。

### 阶段三：工作记录（约 1 周）
- 工作记录 CRUD API；**唯一性校验**：日报每人每天一条、周报每人每周一条（record_date 周报存周一）；仅记录人可改删。
- 前端：工作记录列表（筛选）、新建/编辑（类型、日期、Markdown）、删除；提交时对“重复日报/周报”错误做友好提示。

### 阶段四：考核与 AI 评分（约 1.5 周）
- 考核队列：入队、Worker 轮询、按**记录人岗位**考核标准调 LLM、写 score_records（**每条记录仅一条 AI 评分**）；评分可带 remark。
- 人工评分 API（body 含 **总分 totalScore**、**评分说明 remark**，二者必填）；不能给自己评分；每人每条记录只能评一次，重复则 409；`DELETE /api/score-records/:id` 仅评分人可删；`GET /api/work-records/:id/criteria` 返回岗位考核项；总成绩对一条 AI 与多条人工评分聚合（人工取平均）。
- 前端：记录详情页、评分列表（展示评分说明；**评分人可删自己的评分**；若当前用户已评过则隐藏人工评分按钮）、人工评分表单（含总分与评分说明必填）、总成绩展示；**考核队列查看页** `/score-queue`（列表、状态筛选、跳转工作记录）。

### 阶段五：排名与报表（约 0.5 周）
- 月度/年度考核 API（按部门排名；支持 departmentId 筛选，用于首页“所属部门”）。
- 前端：**首页**即所属部门当月排名；考核排名页 `/assessments`（按部门、月/年筛选），主题适配。

### 阶段六：联调与优化（约 0.5 周）
- 错误处理、日志、安全（限流、输入校验）；部署说明（SQLite 路径、环境变量、Nginx）。

---

## 八、配置与部署要点

- **安装**：首次部署后通过安装向导创建管理员账号与密码，之后仅能通过登录使用系统。
- **环境变量**：数据库路径、JWT 密钥、LLM API Key 及 endpoint。LLM 相关（含 temperature、top_p）也可在系统设置中配置，优先以系统设置为准。
- **系统设置键**（`system_settings`）：如 `token_expire_hours`、`llm_api_url` / `llm_api_key` / `llm_model` / `llm_temperature` / `llm_top_p`、`llm_assessment_interval_seconds`、`llm_assessment_weight_percent`（周报内 AI 占比）、`work_plan_ratio_percent`（工作计划考核占比）、`default_user_password` 等。
- **SQLite**：单文件，注意并发写（可考虑 WAL 模式）。
- **AI 评分**：按**岗位**考核标准拼 prompt；异步队列 + 重试与失败记录。
- **权限**：按用户角色（system_admin / department_admin / user）控制：部门 CRUD 仅系统管理员；岗位/人员写操作系统管理员全部、部门管理员仅本部门；系统设置与考核队列/AI 测试仅系统管理员（设置）或系统/部门管理员（队列与 AI 测试）。工作记录写接口校验 `recorder_id`；评分删除校验 `scorer_id`；安装接口仅未安装时可用。
- **评分**：每条工作记录 AI 仅一条、人工可多人评分（每人每条记录仅一条）；**人工评分**需填写总分与评分说明（均必填）；不能给自己评分；评分人可删自己的评分。**首页**为所属部门评分排名（含工作计划得分、周报得分、总分），**考核队列**提供独立查看页面。**工作计划**变更会触发当月工作计划得分重算（`markWorkPlanScoreDirty`）。

以上为完整设计与实施计划，可按阶段迭代开发；考核标准以岗位为单位维护，日报/周报与评分唯一性由后端严格校验，主题与安装流程已纳入设计。
