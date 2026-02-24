# 工作智能评分平台

日报/周报录入，工作计划管理，AI 与人工双通道考核，按部门/岗位标准评分，月度/年度排名（总分 = 工作计划得分×占比 + 周报得分×占比，可配置）。技术栈：NestJS + React + Vite + Ant Design + SQLite。

---

## 使用（npm 安装）

```bash
npm install -g work-score
work-score
```

或 `npx work-score`。默认端口 **3000**，首次访问进入安装向导。端口、数据库、AI 等配置见 [部署说明](docs/DEPLOY.md#环境变量)。需 **Node.js ≥ 22.5**。

---

## 开发（从源码运行）

| 端 | 命令 | 端口 |
|----|------|------|
| 后端 | `cd backend && npm i && npm run start:dev` | 3000 |
| 前端 | `cd frontend && npm i && npm run dev` | 5173（/api 代理到后端） |

设计与 API：[DESIGN.md](docs/DESIGN.md) · 部署与环境变量：[DEPLOY.md](docs/DEPLOY.md) · 功能与使用说明：[功能说明.md](docs/功能说明.md)

---

## 功能入口（简要）

| 入口 | 路径 |
|------|------|
| 安装向导 / 登录 | `/setup` · `/login` |
| 首页（部门当月排名） | `/` |
| 工作记录 / 工作计划 / 考核排名 / 考核队列 | `/work-records` · `/work-plans` · `/assessments` · `/score-queue` |
| 系统配置 / 个人 | `/system/*` · `/profile` |

详细功能与角色权限见 [功能说明](docs/功能说明.md)。
