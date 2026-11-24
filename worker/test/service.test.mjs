// The macOS service (service/): the LaunchAgent's plist as install.sh fills it, the start script's Keychain read, and
// install's refusal while the viewer's port is taken. launchctl (and lsof where named) are stand-ins on PATH, so
// nothing is loaded; the Keychain is never read (a stand-in `security` answers).
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import path from 'node:path'
import { test } from 'node:test'

const worker = path.resolve(import.meta.dirname, '..')
const service = path.join(worker, 'service')
const skip = process.platform !== 'darwin' && 'macOS only'
const FAKE_TOKEN = 'csw_' + 'T'.repeat(43)

function tmpDir(name) {
  const tmp = path.join(import.meta.dirname, '.tmp')
  mkdirSync(tmp, { recursive: true })
  return mkdtempSync(path.join(tmp, `${name}-`))
}

/** A folder of stand-in commands: each logs its arguments to <name>.calls and runs `body`. */
function stubs(commands) {
  const dir = tmpDir('bin')
  for (const [name, body] of Object.entries(commands)) {
    const file = path.join(dir, name)
    writeFileSync(file, `#!/bin/bash\nprintf '%s\\n' "$*" >> "${dir}/${name}.calls"\n${body}\n`)
    chmodSync(file, 0o755)
  }
  const calls = (name) => (existsSync(path.join(dir, `${name}.calls`)) ? readFileSync(path.join(dir, `${name}.calls`), 'utf8').trim().split('\n') : [])
  return { dir, calls }
}

const SYSTEM_PATH = '/usr/bin:/bin:/usr/sbin:/sbin'
const run = (args, env) => spawnSync('/bin/bash', args, { env, encoding: 'utf8' })

/** A copy of the service scripts in a worker folder of its own, with a viewer build, as after `npm run build`. */
function workerCopy() {
  const dir = tmpDir('worker')
  mkdirSync(path.join(dir, 'viewer-dist'))
  writeFileSync(path.join(dir, 'viewer-dist', 'worker-build.json'), '{"release":"3de0d6e58111"}\n')
  mkdirSync(path.join(dir, 'src'))
  writeFileSync(path.join(dir, 'src', 'main.mjs'), '// the worker\n')
  writeFileSync(path.join(dir, 'package.json'), '{}\n')
  cpSync(service, path.join(dir, 'service'), { recursive: true })
  return dir
}

test('install --print: the plist with this checkout\'s paths, a 60 s throttle, background priority, no token', { skip }, () => {
  const home = tmpDir('home')
  const r = run([path.join(service, 'install.sh'), '--print'], {
    HOME: home, PATH: `${path.dirname(process.execPath)}:${SYSTEM_PATH}`, USER: 'tester',
    WORKER_NODE: process.execPath, COMBO_WORKER_TOKEN: FAKE_TOKEN, COMBO_API_URL: 'http://127.0.0.1:8000',
  })
  assert.equal(r.status, 0, r.stderr)
  const xml = r.stdout
  assert.ok(!xml.includes('csw_') && !xml.includes('T'.repeat(43)), 'no token in the plist')
  assert.ok(!/__[A-Z_]+__/.test(xml), 'every placeholder filled')
  const plist = JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', '-'], { input: xml, encoding: 'utf8' }))
  assert.equal(plist.Label, 'skin.combo.screenshot-worker')
  // Run from a copy outside ~/Documents, which launchd's jobs can't read.
  const copy = path.join(home, 'Library', 'Application Support', 'combo-skin', 'screenshot-worker')
  assert.deepEqual(plist.ProgramArguments, ['/bin/bash', path.join(copy, 'service', 'start.sh'), process.execPath])
  assert.equal(plist.WorkingDirectory, copy)
  assert.equal(plist.RunAtLoad, true)
  assert.equal(plist.KeepAlive, true)
  assert.ok(plist.ThrottleInterval >= 60)
  assert.equal(plist.ProcessType, 'Background')
  const log = path.join(home, 'Library', 'Logs', 'combo-skin', 'screenshot-worker.log')
  assert.equal(plist.StandardOutPath, log)
  assert.equal(plist.StandardErrorPath, log)
  assert.deepEqual(plist.EnvironmentVariables, {
    PATH: `${path.dirname(process.execPath)}:${SYSTEM_PATH}`,
    COMBO_API_URL: 'http://127.0.0.1:8000',
    WORKER_VIEWER_PORT: '5321',
    WORKER_LOG_FILE: log,
    WORKER_PROFILE_DIR: path.join(home, '.cache', 'cs2-combo-worker', 'chrome-profile'),
  })
  assert.ok(!existsSync(path.join(home, 'Library', 'LaunchAgents')) && !existsSync(copy), '--print writes nothing')
})

test('install --print: another label, address and port; a refused port or an old Node', { skip }, () => {
  const home = tmpDir('home')
  const env = { HOME: home, PATH: SYSTEM_PATH, USER: 'tester', WORKER_NODE: process.execPath }
  const r = run([path.join(service, 'install.sh'), '--print'], { ...env, WORKER_SERVICE_LABEL: 'skin.combo.test-worker', COMBO_API_URL: 'http://127.0.0.1:1234', WORKER_VIEWER_PORT: '5320' })
  assert.equal(r.status, 0, r.stderr)
  const plist = JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', '-'], { input: r.stdout, encoding: 'utf8' }))
  assert.equal(plist.Label, 'skin.combo.test-worker')
  assert.equal(plist.EnvironmentVariables.COMBO_API_URL, 'http://127.0.0.1:1234')
  assert.equal(plist.EnvironmentVariables.WORKER_VIEWER_PORT, '5320')
  assert.equal(plist.StandardOutPath, path.join(home, 'Library', 'Logs', 'combo-skin', 'test-worker.log'))

  const port = run([path.join(service, 'install.sh'), '--print'], { ...env, WORKER_VIEWER_PORT: '8080' })
  assert.notEqual(port.status, 0)
  assert.match(port.stderr, /5320 or 5321/)

  const old = stubs({ node: 'echo v22.11.0' })
  const r22 = run([path.join(service, 'install.sh'), '--print'], { ...env, WORKER_NODE: path.join(old.dir, 'node') })
  assert.notEqual(r22.status, 0)
  assert.match(r22.stderr, /Node 24 or later/)
})

test('start.sh: reads the token from the login keychain, passes it to Node only in its environment', { skip }, () => {
  const fake = stubs({
    security: `printf '%s\\n' '${FAKE_TOKEN}'`,
    node: `[ "$COMBO_WORKER_TOKEN" = '${FAKE_TOKEN}' ] && echo "token ok, args: $*" || echo "token wrong"`,
  })
  const r = run([path.join(service, 'start.sh'), path.join(fake.dir, 'node')], { PATH: `${fake.dir}:${SYSTEM_PATH}`, USER: 'tester', HOME: tmpDir('home') })
  assert.equal(r.status, 0, r.stderr)
  assert.deepEqual(fake.calls('security'), ['find-generic-password -a tester -s combo-skin-worker -w'])
  assert.equal(r.stdout.trim(), `token ok, args: ${path.join(worker, 'src', 'main.mjs')}`)
  assert.ok(!r.stderr.includes('csw_'))
})

test('start.sh: no token in the keychain: a message, exit 2, Node not started', { skip }, () => {
  const fake = stubs({ security: 'echo "security: SecKeychainSearchCopyNext: The specified item could not be found in the keychain." >&2; exit 44', node: 'echo started' })
  const r = run([path.join(service, 'start.sh'), path.join(fake.dir, 'node')], { PATH: `${fake.dir}:${SYSTEM_PATH}`, USER: 'tester', HOME: tmpDir('home') })
  assert.equal(r.status, 2)
  assert.match(r.stderr, /combo-skin-worker/)
  assert.match(r.stderr, /security add-generic-password/)
  assert.deepEqual(fake.calls('node'), [])
})

test('install: refuses while something else holds the viewer\'s port, and loads nothing', { skip }, async () => {
  const blocker = createServer()
  await new Promise((resolve) => { blocker.once('error', resolve); blocker.listen(5320, '127.0.0.1', resolve) })
  try {
    const home = tmpDir('home')
    const fake = stubs({ launchctl: 'exit 113' })
    const r = run([path.join(workerCopy(), 'service', 'install.sh')], {
      HOME: home, PATH: `${fake.dir}:${SYSTEM_PATH}`, USER: 'tester', WORKER_NODE: process.execPath,
      WORKER_SERVICE_LABEL: 'skin.combo.test-worker', WORKER_VIEWER_PORT: '5320',
    })
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /Port 5320 is in use/)
    assert.ok(!fake.calls('launchctl').some((c) => /bootstrap|bootout/.test(c)), fake.calls('launchctl').join('; '))
    assert.ok(!existsSync(path.join(home, 'Library', 'LaunchAgents', 'skin.combo.test-worker.plist')))
  } finally { blocker.close() }
})

test('install: refuses without a viewer build', { skip }, () => {
  const copy = workerCopy()
  rmSync(path.join(copy, 'viewer-dist'), { recursive: true })
  const fake = stubs({ launchctl: 'exit 113', lsof: 'exit 1' })
  const r = run([path.join(copy, 'service', 'install.sh')], { HOME: tmpDir('home'), PATH: `${fake.dir}:${SYSTEM_PATH}`, USER: 'tester', WORKER_NODE: process.execPath })
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /npm run build/)
  assert.ok(!fake.calls('launchctl').some((c) => /bootstrap/.test(c)))
})

test('install: writes the plist and bootstraps it; uninstall boots it out and removes it', { skip }, () => {
  const home = tmpDir('home')
  // launchctl: the job is loaded once installed, and still there for one look after a bootout (it is stopping).
  const fake = stubs({
    launchctl: `state="$(dirname "$0")/loaded"
case "$1" in
  bootstrap) echo 2 > "$state" ;;
  bootout) [ -f "$state" ] || exit 3 ;;
  print) [ -f "$state" ] || exit 113; n=$(cat "$state"); [ "$n" -gt 0 ] && echo $((n - 1)) > "$state" || rm "$state"; [ "$n" -gt 1 ] && echo "	pid = 4242"; exit 0 ;;
esac`,
    lsof: 'exit 1',
  })
  const copy = workerCopy()
  const env = { HOME: home, PATH: `${fake.dir}:${SYSTEM_PATH}`, USER: 'tester', WORKER_NODE: process.execPath, WORKER_SERVICE_LABEL: 'skin.combo.test-worker' }
  const r = run([path.join(copy, 'service', 'install.sh')], env)
  assert.equal(r.status, 0, r.stderr)
  const plist = path.join(home, 'Library', 'LaunchAgents', 'skin.combo.test-worker.plist')
  assert.ok(existsSync(plist))
  const domain = `gui/${process.getuid()}`
  assert.ok(fake.calls('launchctl').includes(`bootstrap ${domain} ${plist}`), fake.calls('launchctl').join('; '))
  assert.ok(!readFileSync(plist, 'utf8').includes('csw_'))
  const installed = path.join(home, 'Library', 'Application Support', 'combo-skin', 'test-worker')
  assert.ok(readFileSync(plist, 'utf8').includes(`<string>${installed}/service/start.sh</string>`))
  for (const file of ['package.json', 'src/main.mjs', 'service/start.sh', 'viewer-dist/worker-build.json']) assert.ok(existsSync(path.join(installed, file)), file)
  const u = run([path.join(copy, 'service', 'uninstall.sh')], env)
  assert.equal(u.status, 0, u.stderr)
  const calls = fake.calls('launchctl')
  const bootout = calls.lastIndexOf(`bootout ${domain}/skin.combo.test-worker`)
  assert.ok(bootout >= 0, calls.join('; '))
  // It waited for the job to be gone before removing its files.
  assert.ok(calls.slice(bootout + 1).filter((c) => c.startsWith('print')).length >= 2, calls.join('; '))
  assert.ok(!existsSync(plist))
  assert.ok(!existsSync(installed))
})
