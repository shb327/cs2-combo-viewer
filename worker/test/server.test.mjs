import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import path from 'node:path'
import { test } from 'node:test'
import { PortInUseError, serveViewer } from '../src/server.mjs'

function fixture() {
  const tmp = path.join(import.meta.dirname, '.tmp')
  mkdirSync(tmp, { recursive: true })
  const dir = mkdtempSync(path.join(tmp, 'dist-'))
  writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>x</title>')
  writeFileSync(path.join(dir, 'app.js'), 'console.log(1)')
  writeFileSync(path.join(dir, '_headers'), "/*\n  Content-Security-Policy: default-src 'self'\n  X-Content-Type-Options: nosniff\n\n/app.js\n  Cache-Control: immutable\n")
  return dir
}

test('a port already in use stops with a message naming it', async () => {
  const blocker = createServer()
  await new Promise((r) => blocker.listen(0, '127.0.0.1', r))
  const { port } = blocker.address()
  try {
    await assert.rejects(serveViewer(fixture(), { port }), (e) => e instanceof PortInUseError && e.message.includes(`Port ${port} on 127.0.0.1 is already in use`) && /5320 and :5321/.test(e.message))
  } finally { blocker.close() }
})

test('responses: index for app paths, files with their headers, 404 outside the build', async () => {
  const blocker = createServer()
  await new Promise((r) => blocker.listen(0, '127.0.0.1', r))
  const { port } = blocker.address()
  await new Promise((r) => blocker.close(r))
  const server = await serveViewer(fixture(), { port })
  try {
    const page = await fetch(`${server.url}/combo?capture=1`)
    assert.equal(page.status, 200)
    assert.match(page.headers.get('content-type'), /text\/html/)
    assert.equal(page.headers.get('content-security-policy'), "default-src 'self'")
    const js = await fetch(`${server.url}/app.js`)
    assert.equal(js.headers.get('cache-control'), 'immutable')
    assert.equal(js.headers.get('x-content-type-options'), 'nosniff')
    assert.equal((await fetch(`${server.url}/missing.js`)).status, 404)
    // Paths are clamped to the build: an escape attempt is a missing file there.
    assert.equal((await fetch(`${server.url}/..%2f..%2fpackage.json`)).status, 404)
    assert.equal((await fetch(`${server.url}/app.js`, { method: 'POST' })).status, 405)
  } finally { await server.close() }
})
