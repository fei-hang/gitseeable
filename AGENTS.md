# gitseeable — Agent Guide

Full-stack Git repo visualizer: React 19 + Vite 5 + TS frontend (`client/`, ESM), Express 5 + TS backend (`server/`, CJS, `simple-git`). No database — git is the data; prefs live in `server/state.json` (gitignored). Windows-only (drive enumeration loops `A:`–`Z:`). Published as `npm i -g gitseeable`, where the built client is served from `server/dist/public`.

## Setup

- **3 independent `npm install`s — no npm workspaces** (each dir has its own lockfile):
  `npm install && cd client && npm install && cd ../server && npm install`
- README pins Node **v20.19.3**; this machine runs **v22.22.3** and dev/lint/typecheck all work — don't block on the pin.

## Commands (from repo root)

| Command | What |
|---|---|
| `npm run dev` | API `:3001` + Vite `:3000` (concurrently) — long-lived, background shell only |
| `npm run server` | API only → `npx tsx server/index.ts` |
| `npm run client` | Vite only → `cd client && npm run dev` |
| `npm run build` | client build → server tsc → `scripts/copy-client.js` (`client/dist` → `server/dist/public`; errors if client not built first) |
| `npm start` | Production: `node server/dist/index.js` (API + client on `:3001`) |
| `cd client && npm run lint` | ESLint (flat config) |
| `cd client && npx tsc --noEmit` | Client typecheck (no npm script exists) |
| `cd server && npx tsc --noEmit` | Server typecheck |

## Verification

- **No tests, no CI** (server `test` script is the npm stub). The gate is lint + typecheck; both are green as of this writing.
- Lint **exits 0 with ~38 pre-existing warnings** — require 0 errors + no NEW warnings from your change; don't fix unrelated warnings.

## Dev servers & ports — read before starting anything

- **Never `Start-Process`** (project rule); never run a dev server in a foreground shell (hangs until timeout).
- **`Start-Job` does not survive the invoking shell** (jobs vanish with the process — verified). Start services with the shell tool's **background mode**, or reuse a stack already running from a previous session.
- A previous session may have left servers up — check first:
  `Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 3000,3001 }`
- **Vite has no `strictPort`**: if `:3000` is taken it silently binds `:3001`, shadows the API (`localhost` prefers `::1`), and every `/api` call hits Vite instead of Express. Symptom: app loads, API returns HTML. Fix: kill the duplicate Vite (the `vite.js` process), keep the `tsx` API process.
- **Probe `http://localhost:PORT`, never `127.0.0.1`** — Vite binds `::1` only, so IPv4 probes falsely report "down". Working probe: `Invoke-WebRequest http://localhost:3001/api/ui-state`.
- ⚠ `Test-NetConnection -Port <n>` **errors on this machine** (ValidateSet allows only HTTP/RDP/SMB/WINRM), and `agentsref/dev-quirks.md` still recommends it plus `Start-Job` — both verified broken here. Use `Invoke-WebRequest` / `TcpClient` instead.

## Architecture

- Entry: `client/src/main.tsx` → `App.tsx` → `GitVisualizer.tsx`. All API routes + git ops live in **one file**: `server/index.ts` (~1800 lines).
- `client/src/GitVisualizer.tsx` is **~2400 lines** (tabs, sidebar, graph, diff); its types are declared in-file, not in separate modules. For both giants: grep, don't read end-to-end.
- Layout: `client/src/{api,components,locales,constants}` · `agentsref/` specs · `DOC/` user docs + screenshots · `scripts/copy-client.js` build step.
- Dev networking: `client/vite.config.js` proxies `/api` → `localhost:3001`; `API_BASE_URL = ''` (`client/src/constants/index.ts`).
- Endpoint catalog = `client/src/api/index.ts` (one axios fn per route) + contract in `agentsref/api.md`. Everything is POST except GET `/api/drives`, `/api/last-path`, `/api/ui-state`, plus SSE `GET /api/file-events` (EventSource in `GitVisualizer.tsx` — live worktree updates).
- Persistence: **no client-side storage** (no localStorage/sessionStorage) — UI prefs round-trip `GET/POST /api/ui-state` via a debounced save.
- Express **5**, not 4 (`req.query`, route syntax differ) — see `agentsref/dev-quirks.md`.

## Where to look

| Task | File |
|---|---|
| All API routes / git operations | `server/index.ts` |
| API client (authoritative endpoint list) | `client/src/api/index.ts` |
| Main UI (tabs, graph, diff) | `client/src/GitVisualizer.tsx` + `GitVisualizer.css` |
| Branch CRUD + context menus | `client/src/components/BranchList.tsx`, `ContextMenu.tsx` |
| Merge-conflict editor | `client/src/components/ConflictResolver.tsx` |
| i18n strings | `client/src/locales/{zh,en}.json` (dot-notation keys) |
| Design tokens / themes | `client/src/index.css` (`:root` + `[data-theme="dark"]`) |
| Feature / API / convention / quirk specs | `agentsref/{features,api,conventions,dev-quirks}.md` |

## Conventions

- CSS: BEM modifiers (`btn--primary`, `…--danger`); tokens only in `index.css`; main styling in `GitVisualizer.css`, each component also has its own `.css` beside it.
- Context menu position via `--menu-x` / `--menu-y` custom properties; dangerous items pass `danger: true` → red.
- i18next default **and** fallback = `zh` (`client/src/i18n.ts`): every user-visible string needs both `zh` and `en` entries.
- Components: functional + hooks, `handle*` event handlers, no PropTypes, one component per file (except the two giants above).
- `client/` is ESM, `server/` is CJS — never mix import styles across that boundary.

## Commit workflow (project rules)

- **Commit after every feature/bugfix** with a descriptive message (conventional commits, Chinese subject — match `git log`), then **tell the user the message**. **Do NOT push** — pushes are done manually.
- New feature → update **`DOC/README.md`** with operation instructions + screenshots.
- Before committing: `git status` + `git diff`; stage only intended files (test junk like `.playwright-mcp/`, `.omo/`, `.workbuddy/`, `*.log`, `*.tgz` is gitignored anyway).
- Local identity (this repo only): `张飞航 <feihangzhang@163.com>`; origin → `https://github.com/fei-hang/gitseeable.git`.
