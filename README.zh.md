# GitSeeable

[![npm version](https://img.shields.io/npm/v/gitseeable.svg)](https://www.npmjs.com/package/gitseeable)
[![npm downloads](https://img.shields.io/npm/dm/gitseeable.svg)](https://www.npmjs.com/package/gitseeable)

基于 React 19 + Vite 5（前端）和 Express 5（后端）的全栈 Git 仓库可视化工具。通过直观的 Web 界面浏览本地目录、选择 Git 仓库、管理分支。

## 功能

- **目录浏览器** — 浏览本地文件系统目录并选择 Git 仓库
- **分支管理** — 查看本地和远程分支，支持 checkout、创建、合并、重命名、删除、推送、fetch、rebase
- **提交历史** — 分页查看提交日志，显示作者、日期和提交消息
- **分支对比** — 比较两个分支的前进/落后提交数
- **提交差异** — 查看任意提交的完整 diff
- **国际化** — 支持中文（默认）和英文
- **会话持久化** — 跨会话记住上次浏览的目录

## 截图

| 目录选择 | 仓库分析 |
|---|---|
| ![目录选择](screenshot_select.png) | ![仓库分析](screenshot_analyze.png) |

## 环境要求

- **Node.js v20.19.3**（其他 v20 版本可能也可以，但仅测试了 v20.19.3）

## 技术栈

| 层 | 技术 |
|---|---|
| **前端** | React 19, Vite 5, Axios, i18next, SweetAlert2, TypeScript |
| **后端** | Express 5, simple-git, TypeScript |
| **模块系统** | 前端 ESM，后端 CommonJS |

## 快速开始

### 全局安装（推荐）

```bash
npm install -g gitseeable
gitseeable
```

打开 http://localhost:3001 即可使用。

### 从源码构建

```bash
# 1. 克隆仓库
git clone https://github.com/fei-hang/gitseeable.git
cd gitseeable

# 2. 确保使用 Node v20.19.3（例如使用 nvm）
nvm use 20.19.3

# 3. 安装依赖（三个独立的 npm install，无 npm workspaces）
npm install
cd client && npm install
cd ../server && npm install

# 4. 生产构建（打包前后端）
cd ..
npm run build

# 5. 启动服务
npm start
# 或
node server/dist/index.js
```

打开 http://localhost:3001 即可使用。

### 开发模式

```bash
# 先安装依赖（见上方「从源码构建」），然后：
npm run dev
```

打开 http://localhost:3000 即可使用。

## 命令

| 命令 | 说明 |
|---|---|
| `npm run dev` | 同时启动服务端和客户端 |
| `npm run server` | 仅启动后端（端口 3001） |
| `npm run client` | 仅启动前端（端口 3000） |
| `cd client && npm run build` | 客户端生产构建 |
| `cd client && npm run lint` | 运行 ESLint |
| `cd server && npm run dev` | 服务端开发模式 (tsx watch) |
| `cd server && npm run build` | 编译服务端 TypeScript |

## AI 快速启动

你可以把以下提示词分享给 AI 编程助手（Cursor、Claude Code 等），让它自动启动项目。

**方式一：npm 快速安装（推荐）**

> 全局安装 gitseeable 并运行：`npm install -g gitseeable && gitseeable`。打开 http://localhost:3001，用 `Invoke-WebRequest http://localhost:3001/api/drives -Method GET` 验证后端。

**方式二：从源码克隆**

> 克隆 https://github.com/fei-hang/gitseeable.git，然后用 `nvm use 20.19.3` 设置正确的 Node 版本，用 `npm install && cd client && npm install && cd ../server && npm install` 安装依赖。启动开发服务：在 Linux/macOS 上用 `npx tsx server/index.ts &` 和 `npx vite &`，在 Windows 上用 `Start-Job -ScriptBlock { npx tsx server/index.ts }` 和 `Start-Job -ScriptBlock { Set-Location "client"; npx.cmd vite }`。必须后台运行，不要阻塞终端。用 `Invoke-WebRequest http://localhost:3001/api/drives -Method GET` 验证后端，然后打开 http://localhost:3000。

## 许可

ISC
