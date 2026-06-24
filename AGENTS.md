# gitseeable — Agent Guide

**Generated:** 2026-06-24 | **Commit:** a8ca3bd | **Branch:** main

## Project

Full-stack Git repo visualizer (React 19 + Vite 5 + TypeScript frontend, Express 5 + TypeScript backend, `simple-git`). No database; state persisted to `server/state.json` (gitignored). Windows-only drive enumeration. Published as `npm i -g gitseeable`.

## Structure

```
gitseeable/
├── client/          # React ESM app (type:"module"), TypeScript .ts/.tsx
│   ├── src/
│   │   ├── api/              # Axios API client (index.ts, 120 lines)
│   │   ├── components/       # BranchList, ConflictResolver, ContextMenu
│   │   ├── constants/        # Config constants (5 lines)
│   │   ├── locales/          # i18next zh.json / en.json
│   │   ├── GitVisualizer.tsx # Main component (1575 lines)
│   │   ├── GitVisualizer.css # All styling (1158 lines)
│   │   ├── main.tsx          # Entry → App.tsx → GitVisualizer
│   │   └── index.css         # CSS variables, design tokens
│   ├── vite.config.js        # Proxies /api → localhost:3001
│   └── eslint.config.js      # Flat config
├── server/           # Express CJS (require), TypeScript .ts
│   ├── index.ts              # All endpoints in one file (1082 lines)
│   └── dist/                 # Compiled output + public assets
├── agentsref/        # Reference files (api, conventions, features, dev-quirks)
├── scripts/          # copy-client.js (build helper)
├── .opencode/        # Skill definitions
└── package.json      # Root — only depends on concurrently
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| API endpoints (all) | `server/index.ts` | ALL routes in one file, ~1082 lines |
| API client calls | `client/src/api/index.ts` | Axios functions, one per endpoint |
| Main UI component | `client/src/GitVisualizer.tsx` | Git visualization, tabs, sidebar |
| Branch operations | `client/src/components/BranchList.tsx` | Branch CRUD + context menu |
| Conflict resolution | `client/src/components/ConflictResolver.tsx` | Side-by-side merge conflict editor |
| Context menu | `client/src/components/ContextMenu.tsx` | Reusable right-click menu |
| i18n strings | `client/src/locales/{zh,en}.json` | Dot-notation keys |
| CSS design tokens | `client/src/index.css` | `:root` + `[data-theme="dark"]` variables |
| Feature specs | `agentsref/features.md` | Screenshots + behavior for every feature |
| API contract | `agentsref/api.md` | Request/response format |
| Conventions | `agentsref/conventions.md` | Naming, CSS, i18n, patterns |
| Dev quirks | `agentsref/dev-quirks.md` | Platform-specific edge cases |

## Persistence

All state → server's `state.json`. **No client-side storage.** Two endpoints:

| Endpoint | Purpose |
|---|---|
| `GET /api/ui-state` | Load prefs on mount (tab, sidebar, lang, theme) |
| `POST /api/ui-state` | Save via debounced `queueSaveUiState` |

## API Endpoints

All in `server/index.ts`. `GET /api/drives`, remainder are `POST`.

`/api/commits`, `/api/branches`, `/api/checkout`, `/api/branch` (CRUD), `/api/commit-files`, `/api/commit-file-diff`, `/api/commit-graph` (paginated log --graph), `/api/merge-branch`, `/api/rebase-branch`, `/api/local-status`, `/api/local-commit`, `/api/local-stage`, `/api/local-unstage`, `/api/local-restore`, `/api/local-file-diff`, `/api/drives`, `/api/ui-state`.

Full contract: `agentsref/api.md`

## CONVENTIONS

- **CSS**: Variables in `index.css` (`:root` + `[data-theme="dark"]`). BEM naming (`btn--primary`). Context menu pos via `--menu-x`/`--menu-y` CSS custom properties.
- **i18n**: i18next + react-i18next. Default locale `zh`. Dot-notation keys.
- **Components**: Functional + hooks, `handle*` event handlers, one file per component, no PropTypes.
- **Graph rendering**: 8 fixed lane colors, char-by-char coloring based on position in graph string.
- **Dangerous actions**: Context menu sets `danger: true` → styled red.
- **Module systems**: `client/` ESM (`import`), `server/` CJS (`require`).
- **File naming**: PascalCase components, camelCase utilities.

## CODE MAP (Key Interfaces)

| Symbol | Type | Location | Lines | Role |
|--------|------|----------|-------|------|
| `GitVisualizer` | Function component | `client/src/GitVisualizer.tsx` | 1575 | Main app: tabs, sidebar, graph, diff |
| `BranchList` | Function component | `client/src/components/BranchList.tsx` | 65 | Branch CRUD with context menus |
| `ConflictResolver` | Function component | `client/src/components/ConflictResolver.tsx` | 393 | Side-by-side merge conflict editor |
| `ContextMenu` | Function component | `client/src/components/ContextMenu.tsx` | 41 | Reusable positioned right-click menu |
| `CommitGraphResponse` | Interface | `client/src/api/index.ts` | — | Graph API response shape |
| `LocalStatusEntry` | Interface | `client/src/GitVisualizer.tsx` | — | Status entry shape |
| `FileEntry` | Interface | `server/index.ts` | — | Commit file entry shape |
| Server app | Express app | `server/index.ts` | 1082 | All routes, git ops, state management |

## Git config (local, this repo only)

- `user.name = 张飞航`, `user.email = feihangzhang@163.com`
- Remote: `origin` → `https://github.com/fei-hang/gitseeable.git`

## Commit workflow

Run `git commit` after every modification with a descriptive message. **Do NOT push** (done manually).
IF you run git commit, tell me a descriptive message.
IF you add a new feature, update `DOC/README.md` with operation instructions and screenshots.

**Commit after every feature or bug fix.** Before committing, inspect `git status` and `git diff`; stage only intended files (exclude `.playwright-mcp/`, `.omo/run-continuation/`, and other test artifacts).

## Dependencies

Three independent `npm install` — **no workspaces**:

```
npm install && cd client && npm install && cd ../server && npm install
```

Node 20.19.3 required.

## Commands

| From root | What |
|---|---|
| `npm run dev` | Starts both server (`:3001`) and client (`:3000`) via `concurrently` |
| `npm run server` | Server only (`npx tsx server/index.ts`) |
| `npm run client` | Client only (`cd client && vite`) |
| `npm run build` | Build client + server + copy to `server/dist/public` |
| `cd client && npm run lint` | ESLint (flat config + TypeScript) |
| `cd server && npm run build` | Compile server TS → `server/dist/` |

## Starting servers

Never `Start-Process`. Use npm script or PowerShell jobs:

```powershell
# Both (blocks):
npm run dev

# Non-blocking (PowerShell jobs):
Start-Job -ScriptBlock { npx tsx server/index.ts }
Start-Job -ScriptBlock { Set-Location "client"; npx.cmd vite }

# Poll port instead of Start-Sleep:
while (-not (Test-NetConnection localhost 3001 -WarningAction SilentlyContinue).TcpTestSucceeded) { Start-Sleep -ms 500 }
```

## Reference files (`agentsref/`)

- `features.md` — Feature specs, screenshots, behavior
- `api.md` — Full API reference with request/response format
- `conventions.md` — CSS, i18n, component, naming rules
- `dev-quirks.md` — Express 5 quirks, Vite proxy, port polling

## Dev Quirks

- **Express 5**: API differs from Express 4 (`req.query`, error handling).
- **Vite proxy**: `client/vite.config.js` proxies `/api` → `localhost:3001`. `API_BASE_URL` is `""`.
- **Module mismatch**: `client/` ESM, `server/` CJS. Both TypeScript.
- **Server dev**: `npx tsx server/index.ts` (runs TS directly).
- **Huge files**: `GitVisualizer.tsx` (1575 lines), `server/index.ts` (1082 lines). Types are in-file, not separate.
- **LSP**: TypeScript LSP not installed — `codegraph` tools are the primary navigation aid.
- **No tests**. No CI/CD pipelines.

## OpenCode skills

Loaded from `.opencode/skills/`: `frontend-spec`, `dy-skill-i18n`, `ui-design-system`.
System-level: `kimi-webbridge`.
