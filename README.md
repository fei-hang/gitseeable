# GitSeeable

[中文版](README.zh.md)

A full-stack Git repository visualization tool built with React 19 + Vite 5 (frontend) and Express 5 (backend). Browse local directories, select Git repositories, and manage branches through an intuitive web UI.

## Features

- **Directory Browser** — Navigate local filesystem directories and select Git repositories
- **Branch Management** — View local and remote branches, checkout, create, merge, rename, delete, push, fetch, and rebase
- **Commit History** — Paginated commit log with author, date, and message display
- **Branch Comparison** — Compare two branches to see ahead/behind commits
- **Commit Diff** — View the full diff of any commit
- **Internationalization** — Supports Chinese (default) and English
- **Session Persistence** — Remembers the last browsed directory across sessions

## Screenshots

| Directory Selection | Repository Analysis |
|---|---|
| ![Directory selection](screenshot_select.png) | ![Repository analysis](screenshot_analyze.png) |

## Requirements

- **Node.js v20.19.3** (other v20 versions may work, but v20.19.3 is tested)

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, Vite 5, Axios, i18next, SweetAlert2 |
| **Backend** | Express 5, simple-git |
| **Module System** | Frontend ESM, Backend CommonJS |

## Getting Started

```bash
# 1. Clone the repository
git clone https://github.com/fei-hang/gitseeable.git
cd gitseeable

# 2. Ensure you're using Node v20.19.3 (e.g. with nvm)
nvm use 20.19.3

# 3. Install dependencies (3 independent installs — no npm workspaces)
npm install
cd client && npm install
cd ../server && npm install

# 4. Start development (both server:3001 and client:3000)
cd ..
npm run dev
```

Open http://localhost:3000 in your browser.

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Start both server + client concurrently |
| `npm run server` | Start backend only (port 3001) |
| `npm run client` | Start frontend only (port 3000) |
| `cd client && npm run build` | Production build |
| `cd client && npm run lint` | Run ESLint |

## AI-Friendly Quick Start

You can share the following prompt with an AI coding assistant (Cursor, Claude Code, etc.) to clone and start this project automatically:

> Clone https://github.com/fei-hang/gitseeable.git, then run `nvm use 20.19.3` to set the correct Node version, install dependencies with `npm install && cd client && npm install && cd ../server && npm install`, and start both servers with `cd .. && npm run dev`. The dev servers are long-lived processes — do not wait for them to exit. Use `Invoke-WebRequest http://localhost:3001/api/drives -Method GET` to verify the backend is running.

## License

ISC
