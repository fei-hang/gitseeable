# GitSeeable

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

## 技术栈

| 层 | 技术 |
|---|---|
| **前端** | React 19, Vite 5, Axios, i18next, SweetAlert2 |
| **后端** | Express 5, simple-git |
| **模块系统** | 前端 ESM，后端 CommonJS |

## 快速开始

```bash
# 安装依赖（三个独立的 npm install，无 npm workspaces）
npm install
cd client && npm install
cd ../server && npm install

# 启动开发服务（server:3001 + client:3000）
cd ..
npm run dev
```

打开 http://localhost:3000 即可使用。

## 命令

| 命令 | 说明 |
|---|---|
| `npm run dev` | 同时启动服务端和客户端 |
| `npm run server` | 仅启动后端（端口 3001） |
| `npm run client` | 仅启动前端（端口 3000） |
| `cd client && npm run build` | 生产构建 |
| `cd client && npm run lint` | 运行 ESLint |

## 许可

ISC
