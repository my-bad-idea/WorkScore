# WorkScore — Agent 说明

工作智能评分平台：前后端分离，后端 NestJS + TypeScript + SQLite，前端 React + Vite + Ant Design。支持安装向导、登录认证、部门/岗位/人员配置、工作记录（日报/周报）、AI 与人工评分、考核队列、月度/年度部门排名。

## 权威文档

- **设计与 API**：[docs/DESIGN.md](docs/DESIGN.md) — 系统架构、数据库、API 设计、业务流程、实施阶段。
- **部署与环境变量**：[docs/DEPLOY.md](docs/DEPLOY.md) — 环境变量、生产构建、Nginx 示例、首次部署。

修改业务逻辑或 API 时请优先查阅上述文档。

## 目录说明

- **backend/src**：NestJS 源码
  - `app.module.ts`、`main.ts` — 入口与全局配置
  - `common/` — 守卫（JwtAuthGuard、AdminGuard）、装饰器（CurrentUser、Public）、过滤器（AllExceptionsFilter）
  - `config/` — DatabaseService、SQLite 初始化与迁移
  - `auth/`、`setup/` — 认证与安装向导
  - `departments/`、`positions/`、`users/`、`settings/` — 系统配置
  - `work-records/`、`scores/`（含 score-queue.processor）、`assessments/` — 工作记录、评分与考核、排名
- **frontend/src**：React 源码
  - `api/client.ts` — 请求封装与各 *Api
  - `theme/` — 主题配置与 ThemeContext
  - `layouts/` — MainLayout、SystemLayout、AuthLayout
  - `pages/` — 各业务页（含 system 子目录）
  - `stores/` — 如 auth 状态

## 构建与运行

- **后端**（端口 3000）  
  `cd backend && npm install && npm run start:dev`  
  生产：`npm run build && npm run start:prod`（需 Node `--experimental-sqlite`，见 package.json）。
- **前端**（端口 5173）  
  `cd frontend && npm install && npm run dev`  
  开发时 Vite 将 `/api` 代理到后端；生产构建与 Nginx 配置见 [docs/DEPLOY.md](docs/DEPLOY.md)。

## 注意事项

- 后端启动依赖 Node 的 **`--experimental-sqlite`**，脚本中已配置。
- 工作记录唯一性：日报每人每天一条，周报每人每周一条（周以周一日期为准）；评分：每条工作记录最多一条 AI、一条人工；权限：管理员可写系统配置，仅记录人可改删工作记录，仅评分人可删自己的评分。细节以 [docs/DESIGN.md](docs/DESIGN.md) 为准。
- 修改 API 时需同时考虑：后端控制器/服务 与 前端 [frontend/src/api/client.ts](frontend/src/api/client.ts) 的路径、参数与类型。

## 推荐 Agent 使用方式

全栈开发本仓库时，可结合项目 **.cursor/skills/** 中的领域技能（work-score-domain、backend-nestjs-sqlite、frontend-react-antd）与 **.cursor/rules/** 中的规则（project-overview、backend-nestjs、frontend-react-antd、api-contracts），以保持与现有技术栈和业务约定一致。
