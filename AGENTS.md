# gitseeable — Agent Guide

## Project

Full-stack Git repo visualizer (React 19 + Vite 5 frontend, Express 5 backend, `simple-git` for server-side Git ops). Windows-only drive enumeration. No database; state is ephemeral or persisted to `server/opencode.json` (gitignored).

No tests, no CI/CD, no Prettier, no TypeScript in source (`.d.ts` devDeps are IDE-only).

## Git config (local, this repo only)

- `user.name = 张飞航`
- `user.email = feihangzhang@163.com`
- Remote: `origin` → `https://github.com/fei-hang/gitseeable.git`
- All 6 commits rewrote with `git filter-branch` — use `git push -f origin main` after any history rewrite

## Dependencies

Three independent `npm install` calls — **no npm workspaces**:

```
npm install && cd client && npm install && cd ../server && npm install
```

Node 20.19.3 required (via nvm). Use `nvm use 20.19.3` before any npm operations.

## Commands

| From root | What |
|---|---|
| `npm run dev` | Starts both server (`:3001`) and client (`:3000`) via `concurrently` |
| `npm run server` | Server only |
| `npm run client` | Client only |
| `cd client && npm run build` | Production build |
| `cd client && npm run lint` | ESLint (flat config) |

## Structure

```
client/         — React ESM app (type: "module")
server/         — Express CJS app (require)
package.json    — root, only depends on concurrently
.opencode/      — skill definitions (agent-guide, i18n, frontend-spec, ui-new)
```

## API endpoints

All in `server/index.js` (~365 lines). REST: `GET /api/drives`, remainder are `POST` calls.

| Endpoint | Purpose |
|---|---|
| `POST /api/commits` | Get commit list for a ref |
| `POST /api/branches` | List branches (current + all) |
| `POST /api/checkout` | Checkout branch or create-and-checkout |
| `POST /api/branch` | Create / rename / delete branch |
| `POST /api/commit-files` | List changed files in a commit |
| `POST /api/commit-file-diff` | Get per-file diff (only +/- lines, no metadata) |
| `GET /api/drives` | Windows drive enumeration |

## Frontend conventions

- **CSS**: Design tokens in `client/src/index.css` (`:root` variables), plain `.css` files, BEM-like naming: `btn--primary`, `branch-item--selected`. Context menu positioning via `--menu-x`/`--menu-y` CSS custom properties.
- **i18n**: i18next + react-i18next. Default locale is `zh`. Keys use dot notation. Files in `client/src/locales/{zh,en}.json`.
- **Components**: Functional + hooks, `handle*` event handlers, one file per component, no PropTypes.
- **Sidebar**: Resizable via drag handle (min-width 80px). Commit items expandable: click commit → files list → click file → per-file diff.
- **Dangerous actions**: Context menu `danger` boolean property styles destructive ops red.

## Dev server quirks

- Dev servers are long-lived — **never** use `bash` with `npm run dev`, `node server/index.js`, or `npx vite`. The tool waits for process exit and will hang until ~2 min timeout.
  - **To test startup:** set a short timeout (`8000ms`) — a timeout kill is normal success.
  - **To verify endpoints:** if server is already running in a separate terminal, use `Invoke-WebRequest` / `curl` — these exit immediately.
- **Express 5**: API differs from Express 4 (`req.query`, error handling).
- **Vite proxy**: `client/vite.config.js` proxies `/api` → `localhost:3001`. `API_BASE_URL` is `""` (empty string).
- **Module systems**: `client/` is ESM (type: "module"), `server/` is CommonJS (`require`).

## OpenCode skills

Loaded from `.opencode/skills/`:
- `frontend-spec` — coding conventions (2-space, single quotes, BEM CSS, etc.)
- `dy-skill-i18n` — i18n translation workflow
- `ui-new` — UI component generation and design system
