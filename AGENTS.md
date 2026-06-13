# gitseeable — Agent Guide

## Project

Full-stack Git repo visualizer (React 19 + Vite 5 frontend, Express 5 backend, `simple-git` for server-side Git ops). Windows-only drive enumeration. No database; state is persisted to `server/state.json` (gitignored).

No tests, no CI/CD, no Prettier, no TypeScript in source (`.d.ts` devDeps are IDE-only).

## Git config (local, this repo only)

- `user.name = 张飞航`
- `user.email = feihangzhang@163.com`
- Remote: `origin` → `https://github.com/fei-hang/gitseeable.git`
- All 6 commits rewrote with `git filter-branch` — use `git push -f origin main` after any history rewrite

## Commit workflow

After every modification (bug fix, feature, refactor, config change), run `git commit` with a descriptive message. **Do NOT run `git push`** — pushing is done manually.

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

All in `server/index.js` (~520 lines). REST: `GET /api/drives`, remainder are `POST` calls.

| Endpoint | Purpose |
|---|---|
| `POST /api/commits` | Get commit list for a ref |
| `POST /api/branches` | List branches (current + all) |
| `POST /api/checkout` | Checkout branch or create-and-checkout |
| `POST /api/branch` | Create / rename / delete branch |
| `POST /api/commit-files` | List changed files in a commit |
| `POST /api/commit-file-diff` | Get per-file diff (only +/- lines, no metadata) |
| `POST /api/commit-graph` | Git log --graph with pagination, optional `branch` filter |
| `POST /api/merge-branch` | Git merge a branch into current |
| `POST /api/rebase-branch` | Git rebase (single-arg form: `git rebase <target>`, rebases current branch onto target) |
| `POST /api/local-status` | Git status --porcelain (filters out pure directories) |
| `POST /api/local-commit` | Git add + git commit |
| `POST /api/local-stage` | Git add individual files |
| `POST /api/local-unstage` | Git restore --staged |
| `POST /api/local-restore` | Git checkout/restore for files |
| `POST /api/local-file-diff` | Git diff for a specific file |
| `GET /api/drives` | Windows drive enumeration |

## Frontend conventions

- **CSS**: Design tokens in `client/src/index.css` (`:root` variables), plain `.css` files, BEM-like naming: `btn--primary`, `branch-item--selected`. Context menu positioning via `--menu-x`/`--menu-y` CSS custom properties.
- **i18n**: i18next + react-i18next. Default locale is `zh`. Keys use dot notation. Files in `client/src/locales/{zh,en}.json`.
- **Components**: Functional + hooks, `handle*` event handlers, one file per component, no PropTypes.
- **Sidebar**: Resizable via drag handle (min-width 80px). Commit items expandable: click commit → files list → click file → per-file diff.
- **Dangerous actions**: Context menu `danger` boolean property styles destructive ops red.

## Progress

### Implemented features
- **Theme toggle**: Light/dark mode persisted to `state.json`, sun/moon button in both headers, all hardcoded colors replaced with CSS variables.
- **Branch graph**: `POST /api/commit-graph` returns `git log --graph` with pagination. Frontend renders colored ASCII lanes (8-color palette) with connector-only rows for topology. Optional `branch` param filters to specific branch instead of `--all`.
- **Local changes tab**: Status → stage/unstage/restore flow. `POST /api/local-status` filters out pure directories. Untracked files excluded from restore API (shows skip count in confirm dialog).
- **Side-by-side diff**: Virtual scroll (ROW_HEIGHT = 20px, ±20 buffer) for performance. Draggable split pane divider between original/modified columns.
- **Commit list pagination**: Page size selector (10/20/50/100/200), go-to-page input with Enter support. `POST /api/commits` supports `pageSize <= 0` for no limit.
- **Merge & rebase**: `POST /api/merge-branch` and `POST /api/rebase-branch` (two-arg form). Post-operation graph reloads.
- **Remote branch checkout**: Branches with `/` auto-create local tracking branch (`--track`).
- **Checkout conflict detection**: Error string `'would be overwritten by checkout'` triggers i18n key `dialog.checkoutConflict`.
- **Branch graph filtering**: Double-click branch name → reloads graph filtered by that branch. Click branch label → resets to show all branches.

### Key conventions
- CSS variables in `index.css` (`:root` + `[data-theme="dark"]`). BEM naming. `--menu-x`/`--menu-y` for context menu positioning.
- Frontend spells skill as `ui-design-system` (not `ui-new`).
- Graph rendering uses 8 fixed lane colors, char-by-char coloring based on position in graph string.
- Virtual scroll `ResizeObserver` effect has empty deps — observes once on mount.

## Dev server quirks

- Dev servers are long-lived — **never** use `bash` with `npm run dev`, `node server/index.js`, or `npx vite`. The tool waits for process exit and will hang until ~2 min timeout.
  - **To test startup:** set a short timeout (`8000ms`) — a timeout kill is normal success.
  - **To verify endpoints:** if server is already running in a separate terminal, use `Invoke-WebRequest` / `curl` — these exit immediately.
- **Express 5**: API differs from Express 4 (`req.query`, error handling).
- **Vite proxy**: `client/vite.config.js` proxies `/api` → `localhost:3001`. `API_BASE_URL` is `""` (empty string).
- **Module systems**: `client/` is ESM (type: "module"), `server/` is CommonJS (`require`).
- **Port polling, not `Start-Sleep`**: To wait for server startup, poll the port instead of sleeping — `Start-Sleep` produces no output and causes the agent to appear frozen. Use `Test-NetConnection -ComputerName localhost -Port 3001 -WarningAction SilentlyContinue` or try `Invoke-WebRequest http://localhost:3001/api/drives -ErrorAction SilentlyContinue` in a loop with a short sleep (≤500ms).
- **Start server + client without hanging**: Use `Start-Process` — but **never** combine multiple `Start-Process` calls in one bash call with semicolons. Power​Shell waits for all child processes to exit when `.cmd` scripts (e.g. `npx.cmd`) are involved, causing the tool to hang.
  - **Correct pattern** — two separate bash calls:
    1. `Start-Process -NoNewWindow -FilePath "node" -ArgumentList "server/index.js"`
    2. `Start-Process -NoNewWindow -FilePath "npx.cmd" -ArgumentList "vite" -WorkingDirectory "D:\softwareDataDirectory\JavaScript\gitseeable\client"`

## OpenCode skills

Loaded from `.opencode/skills/`:
- `frontend-spec` — coding conventions (2-space, single quotes, BEM CSS, etc.)
- `dy-skill-i18n` — i18n translation workflow
- `ui-design-system` — UI component generation and design system

Also available (system-level, `~/.config/opencode/skills/`):
- `kimi-webbridge` — browser automation, screenshot, and web interaction
