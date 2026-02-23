# 部署说明

本文说明：环境变量、生产构建、Nginx、一体化安装包、npm 发布。**仅用 npm 安装运行**请直接看仓库 [README](../README.md) 的「使用（npm 安装）」即可。

## 环境变量

### 后端 (backend)

| 变量 | 说明 | 默认 |
|------|------|------|
| `PORT` | 服务端口 | 3000 |
| `DATABASE_PATH` | SQLite 数据库文件路径 | `./data.sqlite` |
| `JWT_SECRET` | JWT 签名密钥 | 开发用默认值（生产务必修改） |
| `LLM_API_URL` | 大模型 API 地址（如 OpenAI compatible） | 不设则 AI 评分写 0 分待复核 |
| `LLM_API_KEY` | 大模型 API Key | 可选 |
| `LLM_MODEL` | 大模型模型名（如 gpt-3.5-turbo） | 可选，也可在系统设置中配置 |

LLM 相关配置优先从**系统设置**（系统配置 → 设置）读取；未配置时使用以上环境变量。

### 前端 (frontend)

默认使用相对路径 `/api` 请求后端，生产环境依赖 Nginx 等将 `/api` 转发到后端即可，无需额外环境变量。

## 生产构建

```bash
# 后端
cd backend
npm ci
npm run build
npm run start:prod

# 前端
cd frontend
npm ci
npm run build
```

前端产物在 `frontend/dist`，由任意静态服务器或 Nginx 托管。

## Nginx 反向代理示例

将 `/api` 转发到后端，其余走前端静态资源：

```nginx
server {
  listen 80;
  server_name your-domain.com;
  root /path/to/frontend/dist;
  index index.html;

  location /api {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

后端需单独运行（如 `PORT=3000 node backend/dist/main.js`），并设置 `DATABASE_PATH`、`JWT_SECRET` 等环境变量。

## 首次部署

1. 部署后端与前端。
2. 访问前端，若未安装会进入安装向导，创建管理员账号与密码。
3. 使用该账号登录，在系统配置中维护部门、岗位、人员与系统设置。

---

## 一体化安装包（前台打包在后台、安装时可自定义端口）

一体化部署将前端构建产物放入后端，由后端在同一端口同时提供 API 与静态页面；端口可通过安装时配置或安装目录下的 `config.json` 修改（默认 3000）。

### 构建一体化产物

在项目根目录执行：

```bash
npm run build:packaged
```

产出：`backend/dist`、`backend/public`（前端静态）、`backend/node_modules`。运行方式：进入 `backend` 目录（或将产出与启动脚本、config 放在同一安装目录），执行 `node --experimental-sqlite dist/main.js`。端口读取顺序：环境变量 `PORT` > 安装目录下的 `config.json` 的 `port` 字段 > 默认 `3000`。

**config.json 示例**（安装目录下）：

```json
{"port": 3000}
```

### 启动脚本

- **Windows**：`scripts/start.bat` — 从同目录 `config.json` 读端口并启动；数据库固定为安装目录下的 `data.sqlite`（通过 `DATABASE_PATH` 指定），启动时控制台会打印路径。
- **macOS / Linux**：`scripts/start.sh` — 从同目录 `config.json` 读端口并启动；使用前请 `chmod +x start.sh`。

安装包内会包含上述启动脚本与 config 模板，安装时由向导或 postinstall 写入用户配置的端口。

### 数据文件位置（Windows 安装包）

- **安装包安装后**：使用「启动 WorkScore」快捷方式或安装目录下的 `start.bat` 启动时，数据库文件为 **安装目录** 下的 `data.sqlite`。默认安装目录为 `%LocalAppData%\WorkScore`（即 `C:\Users\你的用户名\AppData\Local\WorkScore`）。可在该目录下找到 `data.sqlite`、`config.json`。
- **若仍找不到**：从开始菜单或桌面再次运行「启动 WorkScore」，看控制台窗口第一行输出的 `Data file: ...`，即为当前使用的数据库路径。

### 各平台安装包构建

| 平台 | 前置条件 | 构建方式 | 产物 |
|------|----------|----------|------|
| Windows | 先执行 `npm run build:packaged`；本机安装 [Inno Setup](https://jrsoftware.org/isinfo.php) | `iscc scripts/install-windows.iss`（在项目根或 scripts 所在目录执行） | `dist/installers/WorkScore-Setup-0.1.0.exe` |
| macOS | 先执行 `npm run build:packaged` | `sh scripts/build-macos-pkg.sh` | `dist/installers/WorkScore-0.1.0.pkg`；安装时可弹窗配置端口 |
| Linux | 先执行 `npm run build:packaged` | `sh scripts/build-linux-package.sh` | `dist/installers/workscore-0.1.0-linux/` 及 `.tar.gz`；可据此打 .deb/.rpm，使用 `scripts/linux/postinst` 在安装时交互配置端口 |

- **Windows**：安装向导含“服务配置”页，可输入端口（默认 3000），写入安装目录下的 `config.json`；桌面/开始菜单快捷方式指向 `start.bat`。
- **macOS**：安装后可选通过 postinstall 弹窗输入端口，写入 `/Applications/WorkScore/config.json`；启动方式为在终端执行 `/Applications/WorkScore/start.sh` 或自行创建快捷方式。
- **Linux**：打包目录或 tarball 内含 `start.sh` 与 `config.json`；若制作 .deb/.rpm，可将 `scripts/linux/postinst` 放入包中，在安装后（交互模式下）提示输入端口并写入配置。

---

## 发布到 npm（前后端合并包）

项目可打包为单一 npm 包发布到 [npmjs.com](https://www.npmjs.com)，安装后一条命令启动前后台一体服务。

### 项目目录结构（根目录）

- **backend/** — 后端 NestJS 项目
- **frontend/** — 前端 React 项目
- **scripts/** — 构建与安装脚本（含 start.bat、install-windows.iss 等）
- **docs/** — 设计/部署等文档
- **bin/** — npm 包启动入口 `cli.js`（仅发布用）
- **release/** — 仅在执行 `npm run build:npm` 后生成，用于从该目录执行 `npm publish`；已加入 .gitignore

根目录的 `dist/`、`public/`、`node_modules/`、`release/` 均为生成目录，已通过 .gitignore 忽略，不提交到仓库。

### 发布前构建与发布

在项目根目录执行：

```bash
# 一键构建并发布（会生成 release/，进入其中安装依赖并 npm publish）
npm run release
```

若仅想本地生成发布用产物而不上传，可执行：

```bash
npm run build:npm
```

产出：**release/** 目录，内含 `dist/`、`public/`、`bin/`、`package.json`。若要手动发布，进入该目录后执行 `npm install --omit=dev` 与 `npm publish`。

### 使用已发布的包

安装与启动见仓库 [README](../README.md)「使用（npm 安装）」；端口、数据目录、Node 版本等见上文环境变量与注意事项。

### 注意事项

- 需 Node.js 18+，且运行时需支持 `--experimental-sqlite`（Node 22+ 自带；更早版本需确认是否支持）。
- 全局安装时，建议在希望存放数据与配置的目录下执行 `work-score`，以便使用该目录下的 `config.json` 与 `data.sqlite`。
- 若 npm 上 `work-score` 已被占用，可在根目录 `package.json` 中改为 scope 包名（如 `@your-org/work-score`），再执行 `npm publish --access public` 发布。
