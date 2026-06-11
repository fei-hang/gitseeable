# gitseeable — Agent Guide

## Project

Full-stack Git repo visualizer (React 19 + Vite 5 frontend, Express 5 backend, `simple-git` for server-side Git ops). Windows-only drive enumeration. No database; state is ephemeral or persisted to `server/opencode.json`.

No tests exist anywhere in the project. No CI/CD. No formatter (no Prettier). No TypeScript in source (`.d.ts` devDeps are IDE-only).

## Dependencies

Three independent `npm install` calls — there are **no npm workspaces**:

```
npm install && cd client && npm install && cd ../server && npm install
```

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
```

## Quirks

- **Client ESM, server CommonJS** — never assume the same module system.
- **Express 5** — API differs from Express 4 (e.g. req.query, error handling).
- **Vite proxy** — `client/vite.config.js` proxies `/api` → `localhost:3001`. `API_BASE_URL` is `""` (empty string).
- **i18n** — i18next + react-i18next. Default locale is `zh`. Keys use dot notation. Translations in `client/src/locales/{zh,en}.json`.
- **CSS** — plain `.css` files, BEM-like class naming: `btn--primary`, `branch-item--selected`. Context menu positioning via `--menu-x`/`--menu-y` CSS custom properties.
- **Dangerous actions** — context menu actions use a `danger` boolean property to mark destructive ops (styled red).
- **ESLint** — flat config at `client/eslint.config.js`. Run `cd client && npm run lint`.
- **React conventions** — functional components + hooks, `handle*` event handler names, one component per file, no PropTypes.
- **All API endpoints** — defined in `server/index.js` (single file, ~360 lines). REST: `GET /api/drives`, remainder are `POST` calls.

## OpenCode skills

Relevant skills loaded from `.opencode/skills/`:
- `frontend-spec` — coding conventions (2-space, single quotes, BEM CSS, etc.)
- `dy-skill-i18n` — i18n translation workflow
