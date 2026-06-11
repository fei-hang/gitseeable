# GitSeeable

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

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, Vite 5, Axios, i18next, SweetAlert2 |
| **Backend** | Express 5, simple-git |
| **Module System** | Frontend ESM, Backend CommonJS |

## Getting Started

```bash
# Install dependencies (3 independent installs — no npm workspaces)
npm install
cd client && npm install
cd ../server && npm install

# Start development (both server:3001 and client:3000)
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

## License

ISC
