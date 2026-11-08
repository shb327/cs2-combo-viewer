// Serves the worker's own viewer build on 127.0.0.1:5321, with the headers the hosted viewer sends (its _headers).
// The port is fixed: the asset bucket's CORS allows only this viewer's own local ports (5320 and 5321).
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'

export const VIEWER_HOST = '127.0.0.1'
export const VIEWER_PORT = 5321

export class PortInUseError extends Error {}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
}

/** Cloudflare Pages' `_headers`: a path pattern line, then indented `Name: value` lines. */
export function parseHeaders(text) {
  const rules = []
  const glob = (p) => new RegExp('^' + p.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$')
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    if (!/^\s/.test(line)) rules.push({ pattern: glob(line.trim()), headers: [] })
    else {
      const i = line.indexOf(':')
      rules[rules.length - 1]?.headers.push([line.slice(0, i).trim(), line.slice(i + 1).trim()])
    }
  }
  return rules
}

/**
 * Starts the server on the build in `root`.
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
export function serveViewer(root, { host = VIEWER_HOST, port = VIEWER_PORT } = {}) {
  root = path.resolve(root)
  const headersFile = path.join(root, '_headers')
  const rules = existsSync(headersFile) ? parseHeaders(readFileSync(headersFile, 'utf8')) : []
  const server = createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return }
    let urlPath
    try { urlPath = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname) } catch { res.writeHead(400).end(); return }
    for (const rule of rules) if (rule.pattern.test(urlPath)) for (const [k, v] of rule.headers) res.setHeader(k, v)
    let file = path.join(root, path.normalize(urlPath))
    if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403).end(); return }
    let stat = existsSync(file) ? statSync(file) : null
    // A single-page app, as Pages serves it: a path without a file of its own is the app.
    if (!stat?.isFile()) {
      if (path.extname(urlPath)) { res.writeHead(404).end(); return }
      file = path.join(root, 'index.html')
      stat = statSync(file)
    }
    res.setHeader('Content-Type', TYPES[path.extname(file)] ?? 'application/octet-stream')
    res.setHeader('Content-Length', stat.size)
    res.writeHead(200)
    if (req.method === 'HEAD') { res.end(); return }
    createReadStream(file).pipe(res)
  })
  return new Promise((resolve, reject) => {
    server.once('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        reject(new PortInUseError(`Port ${port} on ${host} is already in use. The worker needs exactly this port: the asset bucket's CORS allows only ${host}:5320 and :5321. Stop what uses it (often the viewer's own "npm run preview") and start the worker again.`))
      } else reject(e)
    })
    server.listen(port, host, () => resolve({
      url: `http://${host}:${port}`,
      close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()) }),
    }))
  })
}
