import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// origins.ts reads the page's window when it loads: a page that isn't framed.
globalThis.window = { location: { origin: 'http://localhost:5320' } }
globalThis.window.top = globalThis.window
const { ALLOWED_ORIGINS, isAllowedOrigin } = await import('../src/lib/embed/origins.ts')

const SITES = ALLOWED_ORIGINS.filter((origin) => origin.startsWith('https://'))

test('Combo Skin\'s Pages test addresses may talk to the embed', () => {
  assert.ok(isAllowedOrigin('https://combo-skin.pages.dev'))
  assert.ok(isAllowedOrigin('https://preview.combo-skin.pages.dev'))
})

test('the admin dashboard has no hosted address', () => {
  assert.ok(!isAllowedOrigin('https://admin.combo-skin.pages.dev'))
  assert.ok(!isAllowedOrigin('https://admin.combo.skin'))
})

test('look-alike hosts are not allowed', () => {
  for (const origin of [
    'https://evil-combo-skin.pages.dev',
    'https://combo-skin.pages.dev.example.com',
    'https://abc123.combo-skin.pages.dev',
    'https://other.pages.dev',
    'http://combo-skin.pages.dev',
    'https://combo-skin.pages.dev/',
  ]) assert.ok(!isAllowedOrigin(origin), origin)
})

test('the sites are exact origins', () => {
  assert.deepEqual(SITES, [
    'https://combo.skin',
    'https://view.combo.skin',
    'https://combo-skin.pages.dev',
    'https://preview.combo-skin.pages.dev',
  ])
  for (const site of SITES) assert.equal(new URL(site).origin, site)
})

test('frame-ancestors in public/_headers lists the same sites', () => {
  const headers = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8')
  const csp = headers.match(/^\s*Content-Security-Policy:(.*)$/m)[1]
  const sources = csp.split(';').map((d) => d.trim().split(/\s+/)).find(([name]) => name === 'frame-ancestors').slice(1)
  // 'self' is the viewer's own address, view.combo.skin.
  const sites = sources.filter((s) => s.startsWith('https://') || s === "'self'").map((s) => (s === "'self'" ? 'https://view.combo.skin' : s))
  assert.deepEqual([...sites].sort(), [...SITES].sort())
  assert.deepEqual(sources.filter((s) => !sites.includes(s) && s !== "'self'"), ['http://localhost:*', 'http://127.0.0.1:*'])
})
