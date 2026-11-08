// Serves the test host page (a stand-in for combo.skin) on its own local origins, so it frames the viewer cross-origin:
//   node test/host/serve.mjs
// http://127.0.0.1:5322: an allowed origin (on the embed's list).
// http://127.0.0.1:5323: an origin not on the list: the embed must ignore its messages.
// ?noref=1 sends Referrer-Policy: no-referrer, so the embed can't tell its parent's origin until the first message.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const dir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const files = { '/': ['index.html', 'text/html; charset=utf-8'], '/host.js': ['host.js', 'text/javascript; charset=utf-8'] }

for (const port of [5322, 5323]) {
  createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)
    const file = files[url.pathname]
    if (!file) { res.statusCode = 404; res.end(); return }
    res.setHeader('Content-Type', file[1])
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Referrer-Policy', url.searchParams.get('noref') === '1' ? 'no-referrer' : 'strict-origin-when-cross-origin')
    res.end(await readFile(path.join(dir, file[0])))
  }).listen(port, '127.0.0.1', () => console.log(`test host on http://127.0.0.1:${port}`))
}
