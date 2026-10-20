/**
 * GitSeeable for DeepSeek Harness — the host half.
 *
 * Owns two routes and nothing else:
 *   - `<basePath>` (default `/gitseeable`) — the GitSeeable SPA and its
 *     `<basePath>/api/*` endpoints, served by the unchanged GitSeeable Express
 *     application bundled into `server/app.js`.
 *   - `/_gitseeable/mount.json` — the fixed, prefix-independent discovery
 *     route the browser half reads to learn where the SPA was mounted.
 *
 * The git logic itself stays in the GitSeeable application; this file is only
 * routing, so the plugin and the standalone `gitseeable` binary share one
 * implementation.
 */
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

/** Loader-facing plugin name. */
export const name = 'gitseeable'

/** Required host service: the route carrier. */
export const inject = ['webServer']

/** Default mount prefix; a deployment may override it through the row config. */
export const DEFAULT_BASE_PATH = '/gitseeable'

/**
 * Fixed, prefix-independent discovery path. The browser half must learn the
 * mount prefix before it can build any URL under it, so this single route is
 * the one constant both halves share.
 */
export const DISCOVERY_PATH = '/_gitseeable/mount.json'

/** This package's root directory. */
const PACKAGE_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))

/**
 * Default state directory: the plugin lives inside a profile's `node_modules`,
 * which package management may replace at any time, so GitSeeable's UI
 * preferences go to the Harness home instead.
 */
function defaultStateDir() {
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  return path.join(home, 'storages', 'gitseeable')
}

/** Normalize one configured prefix into `/name` (leading slash, no trailing slash). */
function normalizeBasePath(value) {
  if (typeof value !== 'string' || value.trim() === '') return DEFAULT_BASE_PATH
  const trimmed = value.trim().replace(/\/+$/, '')
  if (trimmed === '') return DEFAULT_BASE_PATH
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

/**
 * Load the bundled GitSeeable application with its asset and state locations
 * pointed at this install.
 * @param stateDir - directory receiving `state.json`.
 * @returns the Express application (a `(req, res)` handler).
 */
function loadApplication(stateDir) {
  const serverDir = path.join(PACKAGE_ROOT, 'server')
  const appFile = path.join(serverDir, 'app.cjs')
  if (!fs.existsSync(appFile)) {
    throw new Error(
      `gitseeable: ${appFile} is missing. The package must ship its built server half; reinstall it.`,
    )
  }
  try {
    fs.mkdirSync(stateDir, { recursive: true })
  } catch (error) {
    throw new Error(`gitseeable: cannot create the state directory ${stateDir}: ${error instanceof Error ? error.message : String(error)}`)
  }
  process.env.GITSEEABLE_STATE_FILE = path.join(stateDir, 'state.json')
  process.env.GITSEEABLE_PUBLIC_DIR = path.join(serverDir, 'public')
  const require = createRequire(import.meta.url)
  const loaded = require(appFile)
  return loaded.app ?? loaded.default ?? loaded
}

/**
 * Adapt the Express application to a prefix route: the route table matched
 * `<basePath>` already, so the request path is rewritten to the application's
 * own root before dispatch.
 *
 * The bare prefix redirects to the trailing-slash form because the built SPA
 * references its assets document-relatively (`./assets/…`), which only
 * resolves against a directory URL.
 * @param application - the GitSeeable Express application.
 * @param basePath - normalized mount prefix, no trailing slash.
 * @returns a request handler for the webserver prefix route.
 */
function mountApplication(application, basePath) {
  return (req, res) => {
    const url = req.url ?? '/'
    if (url === basePath || url === `${basePath}?`) {
      res.writeHead(301, { location: `${basePath}/`, 'cache-control': 'no-store' })
      res.end()
      return
    }
    req.url = url.slice(basePath.length) || '/'
    application(req, res)
  }
}

/**
 * Host plugin body: register the application route and the discovery route.
 *
 * The application reads the filesystem and runs git, so it sits behind the same
 * browser authentication the Harness index uses: the tab is served from the
 * application origin, where that cookie is already present, and a probe from
 * anywhere else is refused instead of being answered with repository data.
 * @param ctx - host context carrying `webServer` (and `connection` when the
 *   Web composition installs it).
 * @param config - optional `{ basePath, stateDir }` from the patch row.
 */
export function apply(ctx, config = {}) {
  const basePath = normalizeBasePath(config.basePath)
  const stateDir = config.stateDir || defaultStateDir()
  const application = loadApplication(stateDir)
  const appHandler = mountApplication(application, basePath)

  /** Reject an unauthenticated request before any repository data is read. */
  const authorize = (req, res) => {
    // Read lazily: composition may install Connection after this fiber mounts.
    const connection = ctx.reflect?.get?.('connection') ?? ctx.get?.('connection')
    if (connection === undefined || connection === null || typeof connection.authorizeIndex !== 'function') return true
    return connection.authorizeIndex(req, res, ctx.webServer?.protocol === 'https:')
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: basePath,
    handler: (req, res) => {
      if (!authorize(req, res)) return
      appHandler(req, res)
    },
  }), 'gitseeable: application route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: DISCOVERY_PATH,
    handler: (req, res) => {
      if (!authorize(req, res)) return
      const body = JSON.stringify({ basePath })
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      })
      res.end(req.method === 'HEAD' ? undefined : body)
    },
  }), 'gitseeable: mount discovery route')

  ctx.logger.info(`gitseeable: mounted at ${basePath}`)
}
