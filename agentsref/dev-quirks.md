# Dev Server Quirks

- Dev servers are long-lived — **never** use `bash` with `npm run dev`, `node server/index.js`, or `npx vite`. The tool waits for process exit and will hang until ~2 min timeout.
  - **To test startup:** set a short timeout (`8000ms`) — a timeout kill is normal success.
  - **To verify endpoints:** if server is already running in a separate terminal, use `Invoke-WebRequest` / `curl` — these exit immediately.
- **Express 5**: API differs from Express 4 (`req.query`, error handling).
- **Vite proxy**: `client/vite.config.js` proxies `/api` → `localhost:3001`. `API_BASE_URL` is `""` (empty string).
- **Module systems**: `client/` is ESM (type: "module"), `server/` is CommonJS (`require`). Both now use TypeScript.
- **Server dev**: Uses `npx tsx server/index.ts` (tsx runs TS directly without compilation).
- **Server build**: `cd server && npm run build` compiles to `server/dist/`.
- **TypeScript configs**: `server/tsconfig.json` (CommonJS, ES2020), `client/tsconfig.json` (ESNext, react-jsx).
- **Port polling, not `Start-Sleep`**: To wait for server startup, poll the port instead of sleeping — `Start-Sleep` produces no output and causes the agent to appear frozen. Use `Test-NetConnection -ComputerName localhost -Port 3001 -WarningAction SilentlyContinue` or try `Invoke-WebRequest http://localhost:3001/api/drives -ErrorAction SilentlyContinue` in a loop with a short sleep (≤500ms).
- **Start server + client without hanging**: Use `Start-Job` to run each service as a PowerShell background job. `Start-Job` returns immediately, so the Bash tool completes instantly.
  - **Correct pattern** — two separate bash calls:
    1. `Start-Job -ScriptBlock { npx tsx server/index.ts }`
    2. `Start-Job -ScriptBlock { Set-Location "D:\softwareDataDirectory\JavaScript\gitseeable\client"; npx.cmd vite }`
  - To verify startup, poll the port with `Test-NetConnection` or `Invoke-WebRequest` in a loop.
