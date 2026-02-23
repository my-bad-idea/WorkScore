---
name: backend-nestjs-sqlite
description: Use when modifying or extending the NestJS backend, SQLite access, authentication, or authorization. Covers module layout, DatabaseService, guards, decorators, and API conventions.
---

# Backend (NestJS + SQLite)

## 何时使用

在修改或扩展后端、SQLite 访问、认证（JWT）与权限（管理员/记录人/评分人）时应用本技能。

## 模块划分

- **auth**：登录、改密、JWT 策略；`/api/auth/login`、`/api/auth/me`、`/api/auth/change-password`。
- **setup**：安装向导；`/api/setup/status`、`/api/setup/init`（仅未安装时可用）。
- **departments / positions / users / settings**：系统配置 CRUD；写操作仅管理员（AdminGuard）。
- **work-records**：工作记录 CRUD；写/删仅记录人本人。
- **scores**：评分（含 score-records、score-queue 控制器）、考核队列列表；删除评分仅评分人本人。
- **assessments**：月度/年度排名 API。

所有需登录的控制器使用 `@UseGuards(JwtAuthGuard)`；公开接口用 `@Public()`。全局已注册 `JwtAuthGuard` 与 `AllExceptionsFilter`。

## 数据库与迁移

- **DatabaseService**（`config/database.service.ts`）：注入后通过 `this.db.getDb()` 得到 Node `DatabaseSync`（node:sqlite）。不使用 ORM，不维护独立 SQL 文件；建表与索引在 `runMigrations()` 内嵌执行（`CREATE TABLE IF NOT EXISTS`、`CREATE INDEX IF NOT EXISTS`）。
- 数据库路径：`process.env.DATABASE_PATH ?? join(process.cwd(), 'data.sqlite')`；启动时执行 `PRAGMA journal_mode = WAL`。

## 认证与当前用户

- JWT 从 Header `Authorization: Bearer <token>` 提取；密钥 `process.env.JWT_SECRET`。
- **JwtPayload**：`{ sub: number; username: string; isAdmin: boolean }`，由 `@CurrentUser()` 装饰器注入到控制器方法参数。
- 需要管理员权限的写操作：在控制器或路由上使用 `@UseGuards(AdminGuard)`。

## 错误与响应

- 使用 Nest 标准异常：`BadRequestException`、`ForbiddenException`、`NotFoundException`、`ConflictException` 等（均为 HttpException）。
- 统一由 **AllExceptionsFilter** 处理，响应体为 JSON，如 `{ message: string }`。不要修改该过滤器的响应形状；业务错误信息通过 exception 的 message 传递。

## API 约定

- 控制器路由前缀：`api/`（例如 `@Controller('api/work-records')`）。
- 请求/响应为 JSON；ID 在路径中为数字，通过 `@Param('id')` 取到后可用 `+id` 转成 number。

## 启动

- 需启用 Node 实验性 SQLite：脚本中使用 `node --experimental-sqlite dist/main`（见 `package.json` 的 start/start:prod）。

## 参考

- 入口与全局配置：`app.module.ts`、`main.ts`。
- 守卫与装饰器：`common/guards/jwt-auth.guard.ts`、`common/guards/admin.guard.ts`、`common/decorators/current-user.decorator.ts`、`common/decorators/public.decorator.ts`。
- 过滤器：`common/filters/http-exception.filter.ts`。
- 设计文档：`docs/DESIGN.md` 第四节 API 设计、第七节实施计划。
