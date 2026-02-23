---
name: frontend-react-antd
description: Use when modifying or extending the React frontend, theme (light/dark/system), or API client. Covers Vite, Ant Design, routing, and page/store conventions.
---

# Frontend (React + Vite + Ant Design)

## 何时使用

在修改或扩展前端页面、主题、API 调用或路由时应用本技能。

## 技术栈

- **Vite 5** + **React 18** + **TypeScript**；**Ant Design 5** + 中文 locale（zhCN）。
- **react-router-dom v6**；无全局 Redux，使用 React 状态与 context（如 auth store、ThemeContext）。

## 主题

- 主题配置与工具函数在 **`src/theme/index.ts`**：
  - `ThemePreference`: 'light' | 'dark' | 'system'；`ThemeMode`: 'light' | 'dark'。
  - `getStoredTheme()` / `setStoredTheme()`：localStorage 持久化。
  - `getThemeConfig(mode?)`：返回 Ant Design `ThemeConfig`（含 token、components、algorithm）；深色使用 `theme.darkAlgorithm`。
- 在根组件用 **ConfigProvider** 注入 `theme={getThemeConfig(resolvedTheme)}`、`locale={zhCN}`；`resolvedTheme` 由用户偏好与系统 `prefers-color-scheme` 决定。
- 根元素可通过 `data-theme` 与 CSS 变量配合（若需）；主题切换入口通常在顶栏。

## API 调用

- 所有请求通过 **`src/api/client.ts`**：
  - `api<T>(path, options)`：base 为 `/api`，自动附加 `Authorization: Bearer <token>`（token 从 localStorage 取）；失败时解析 JSON 的 `message` 并 throw Error。
  - 按领域导出：`authApi`、`setupApi`、`departmentsApi`、`positionsApi`、`usersApi`、`settingsApi`、`workRecordsApi`、`scoresApi`、`scoreQueueApi`、`assessmentsApi`。
- 新增或修改后端 API 时，应同步在 `api/client.ts` 中增加或更新对应方法，保持类型与路径一致。

## 路由与布局

- **App.tsx**：BrowserRouter、Routes；`/setup`、`/login` 独立；其余在 `MainLayout` 下（首页、工作记录、考核、考核队列、个人中心等）；`/system` 下为 SystemLayout（部门/岗位/人员/设置）。
- 未安装时仅允许访问 `/setup`；未登录跳转登录；系统配置写操作在前端根据 `isAdmin` 隐藏或禁用。

## 页面与结构

- 页面组件位于 **`src/pages/`**（含 system 子目录）；布局在 **`src/layouts/`**（MainLayout、SystemLayout、AuthLayout）。
- 全局状态：如 **`stores/auth.tsx`** 提供当前用户、登录状态、loading；在需要处使用 `useAuth()`。

## 约定

- 使用函数组件与 Hooks；新增页面需在 `App.tsx` 的 Routes 中注册。
- 与后端交互统一走 `api/client.ts`，不直接 fetch 业务 API。
- 主题相关逻辑集中在 `theme/index.ts` 与 ThemeContext，避免在业务组件中硬编码颜色或算法。

## 参考

- 入口与路由：`App.tsx`、`main.tsx`。
- 主题：`theme/index.ts`、`theme/ThemeContext.tsx`。
- API：`api/client.ts`。
- 设计文档：`docs/DESIGN.md` 第五节前端模块设计。
