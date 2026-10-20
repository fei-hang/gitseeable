# GitSeeable

[![npm version](https://img.shields.io/npm/v/gitseeable.svg)](https://www.npmjs.com/package/gitseeable)
[![npm downloads](https://img.shields.io/npm/dm/gitseeable.svg)](https://www.npmjs.com/package/gitseeable)

[中文版](README.zh.md)

A full-stack Git repository visualization tool built with React 19 + Vite 5 (frontend) and Express 5 (backend). Browse local directories, select Git repositories, and manage branches through an intuitive web UI.

## Features

- **Directory Browser** — Navigate the local filesystem and pick a folder
- **Repository Scan** — Recursively scan the selected folder (up to 3 levels deep) for Git repositories and switch between them from a dropdown
- **Branch Management** — View local and remote branches; checkout, create, merge, rebase, rename, delete, push, fetch and compare
- **Pull Strategy** — Choose **rebase** (default) or **merge** for the case where your branch has diverged from its remote
- **Commit History** — Paginated commit log with author, date and message, plus a per-commit context menu (cherry-pick / revert / reset / drop)
- **Branch Comparison** — Compare two branches to see ahead/behind commits and inspect the full diff of any commit
- **Local Changes** — Staged / unstaged sections with batch stage, unstage and restore; side-by-side diff with full context, collapsible unchanged blocks and a draggable splitter; the preview always shows the latest worktree content
- **Conflict Resolution** — Built-in side-by-side editor for merge / rebase / cherry-pick conflicts
- **Themes** — Light and dark mode
- **Internationalization** — Supports Chinese (default) and English
- **Session Persistence** — Remembers the last opened repository across sessions

## Screenshots

| Directory Selection | Repository Analysis |
|---|---|
| ![Directory selection](screenshot_select.png) | ![Repository analysis](screenshot_analyze.png) |

## Requirements

- **Node.js v20.19.3** (other v20 versions may work, but v20.19.3 is tested)

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, Vite 5, Axios, i18next, SweetAlert2, TypeScript |
| **Backend** | Express 5, simple-git, TypeScript |
| **Module System** | Frontend ESM, Backend CommonJS |

## Getting Started

### Quick Install (npm global)

```bash
npm install -g gitseeable
gitseeable
```

Open http://localhost:3001 in your browser.

### From Source

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

# 4. Production build (bundle frontend + backend)
cd ..
npm run build

# 5. Start server
npm start
# or
node server/dist/index.js
```

Open http://localhost:3001 in your browser.

### Development

```bash
# Install dependencies first (see "From Source" above), then:
npm run dev
```

Open http://localhost:3000 in your browser.

## DeepSeek Harness Plugin (Desktop)

GitSeeable also ships as a **DeepSeek Harness** plugin: instead of running its own
server, it mounts inside the Harness right Sidebar and appears as an entry on the
「开始」 (Start) page. This is what `dsh-plugin/` contains.

### Install

```sh
npm run build:plugin
```

Then install with the CLI that **ships inside the app** — `desktop` is a reserved
profile, and the global `dsh` on your PATH is not allowed to manage it:

```sh
# Windows (paths shown for a default install)
"D:\softwareInstallationDirectory\deepseekharness\resources\runtime\cli\bin\dsh.cmd" \
  plugin --profile desktop add "D:\path\to\gitseeable\dsh-plugin"

# the long form the .cmd wrapper expands to
"D:\softwareInstallationDirectory\deepseekharness\DeepSeek Harness.exe" --expose-internals \
  "D:\softwareInstallationDirectory\deepseekharness\resources\app.asar\dsh\node_modules\@deepseek-ai\dsh-desktop-host\lib\cli.js" \
  plugin --profile desktop add "D:\path\to\gitseeable\dsh-plugin"
```

```sh
# macOS / Linux
"/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" --expose-internals \
  "/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js" \
  plugin --profile desktop add ~/path/to/gitseeable/dsh-plugin
```

**Fully quit and restart** DeepSeek Harness afterwards.

### Use

1. Open the right Sidebar (expand it if it is collapsed).
2. On the 「开始」 (Start) page, click the **GitSeeable** entry.
3. The page opens in that pane, already pointed at the current session's workspace.

`Ctrl/Cmd + Shift + G` opens it too (skipped silently if the chord is taken).

### Theme

The page follows the Harness theme — light to light, dark to dark, including
`System`. There is no separate theme toggle inside the plugin: the framed page
receives the palette on its URL for the first paint and then over `postMessage`,
so switching the Harness theme restyles an open GitSeeable pane immediately
without reloading it or losing the repository you are browsing.

Standalone (`npm start`) keeps its own light/dark switch as before.

### If `dsh plugin add` fails with `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`

The message names `@dsh-ops/bash-win32-x64@0.2.1 could not be checked against
minimumReleaseAge (version not present in registry manifest)`. The cause is a
**registry mirror lag**, not a missing package: that version exists on
`registry.npmjs.org`, but the mirror (e.g. `registry.npmmirror.com`) has not
synced it, so pnpm cannot confirm it and the whole install aborts. Point the
install at the official registry:

```sh
".../dsh.cmd" plugin --profile desktop add --registry=https://registry.npmjs.org/ "D:\path\to\dsh-plugin"
```

`--registry` must come **after** `add`; `remove` rejects the flag and needs
`pnpm remove -w <name> --config.registry=https://registry.npmjs.org/` instead.
To make this permanent for the desktop profile only, put a one-line `.npmrc`
in the profile directory (see `dsh-plugin/README.md`).

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Start both server + client concurrently |
| `npm run server` | Start backend only (port 3001) |
| `npm run client` | Start frontend only (port 3000) |
| `cd client && npm run build` | Client production build |
| `cd client && npm run lint` | Run ESLint |
| `cd server && npm run dev` | Server dev mode (tsx watch) |
| `cd server && npm run build` | Compile server TypeScript |
| `npm run build:plugin` | Client build + assemble the DeepSeek Harness plugin into `dsh-plugin/` |

## AI-Friendly Quick Start

You can share the following prompts with an AI coding assistant (Cursor, Claude Code, etc.) to start this project automatically.

**Option 1: Quick install via npm (recommended)**

> Install gitseeable globally and run it: `npm install -g gitseeable && gitseeable`. Open http://localhost:3001 in the browser and verify the backend with `Invoke-WebRequest http://localhost:3001/api/drives -Method GET`.

**Option 2: Clone from source**

> Clone https://github.com/fei-hang/gitseeable.git, then run `nvm use 20.19.3` to set the correct Node version, and install dependencies with `npm install && cd client && npm install && cd ../server && npm install`. Start development with `npx tsx server/index.ts &` and `npx vite &` (Linux/macOS) or `Start-Job -ScriptBlock { npx tsx server/index.ts }` and `Start-Job -ScriptBlock { Set-Location "client"; npx.cmd vite }` (PowerShell). Background the processes so your terminal stays available. Verify the backend with `Invoke-WebRequest http://localhost:3001/api/drives -Method GET` and open http://localhost:3000 in the browser.

## License

ISC
