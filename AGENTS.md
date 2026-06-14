# gitseeable — Agent Guide

## Project

Full-stack Git repo visualizer (React 19 + Vite 5 + TypeScript frontend, Express 5 + TypeScript backend, `simple-git`). No database; state persisted to `server/state.json` (gitignored). Windows-only drive enumeration.

## Git config (local, this repo only)

- `user.name = 张飞航`, `user.email = feihangzhang@163.com`
- Remote: `origin` → `https://github.com/fei-hang/gitseeable.git`

## Commit workflow

Run `git commit` after every modification with a descriptive message. **Do NOT push** (done manually).

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
