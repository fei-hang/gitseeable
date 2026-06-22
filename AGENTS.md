# gitseeable — Agent Guide

## Project

Full-stack Git repo visualizer (React 19 + Vite 5 + TypeScript frontend, Express 5 + TypeScript backend, `simple-git`). No database; state persisted to `server/state.json` (gitignored). Windows-only drive enumeration.

## Persistence

All persistent state goes through the server's `state.json` file. **No localStorage, sessionStorage, or client-side storage.** Two server endpoints handle persistence:

| Endpoint | Purpose |
|---|---|
| `GET /api/ui-state` → `fetchUiState()` | Load UI prefs on mount (activeTab, sidebarWidth, lang, theme, skipDropConfirm, etc.) |
| `POST /api/ui-state` → `saveUiState(partial)` | Save via debounced `queueSaveUiState` |

Client never writes to `state.json` directly — always through these API calls.

## Git config (local, this repo only)

- `user.name = 张飞航`, `user.email = feihangzhang@163.com`
- Remote: `origin` → `https://github.com/fei-hang/gitseeable.git`

## Commit workflow

Run `git commit` after every modification with a descriptive message. **Do NOT push** (done manually).
IF you run git commit, in finish tell me with a descriptive message.
IF you add a new feature, also update `DOC/README.md` with the corresponding operation instructions and screenshots.

## Dependencies

Three independent `npm install` — **no workspaces**:

```
npm install && cd client && npm install && cd ../server && npm install
```

Node 20.19.3 required. Use `nvm use 20.19.3` before any npm operations.

## Commands

| From root | What |
|---|---|
| `npm run dev` | Starts both server (`:3001`) and client (`:3000`) via `concurrently` |
| `npm run server` | Server only |
| `npm run client` | Client only |
| `cd client && npm run build` | Production build |
| `cd client && npm run lint` | ESLint (flat config + TypeScript) |
| `cd server && npm run build` | Server TypeScript compilation |
| `cd server && npm run dev` | Server dev (tsx watch) |

## Starting servers for testing

**IMPORTANT**: Never use `Start-Process` to start blocking/long-running tasks (servers, watchers, dev commands).
Instead, run the npm script directly via `bash tool`:

```powershell
# Start both servers (blocks until interrupted):
npm run dev

# Or start one at a time, each in its own bash call:
cd server; npx tsx server/index.ts
cd client; npx vite

# If non-blocking is needed, use PowerShell jobs (NOT Start-Process):
$job = Start-Job { Set-Location "D:\softwareDataDirectory\JavaScript\gitseeable"; npm run dev }
Start-Sleep 5; Receive-Job -Job $job
Stop-Job $job; Remove-Job $job
```

## Reference files

`agentsref/` contains categorized reference material. Read the relevant file when the task involves that area:

| File | Contents |
|---|---|
| `agentsref/features.md` | Feature list, screenshots, behavior specs for every feature |
| `agentsref/api.md` | All Express API endpoints, request/response format |
| `agentsref/conventions.md` | Naming, CSS, component, i18n, linting conventions |
| `agentsref/dev-quirks.md` | Known quirks, edge cases, platform-specific notes |

## Structure

```
client/         — React ESM app (type: "module"), TypeScript (.ts/.tsx)
server/         — Express CJS app (require), TypeScript (.ts)
package.json    — root, only depends on concurrently
agentsref/      — categorized reference files (api, conventions, features, dev-quirks)
.opencode/      — skill definitions
```

## OpenCode skills

Loaded from `.opencode/skills/`: `frontend-spec`, `dy-skill-i18n`, `ui-design-system`.
System-level (`~/.config/opencode/skills/`): `kimi-webbridge`.
