// Reproducible production-App integration test. All Supabase traffic is mocked locally.
// Run: node scripts/gardenTheme.production.mjs (uses installed Edge or Chrome).
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, expect as playwrightExpect } from '@playwright/test'
import { buildFlower, buildSoundFlower } from '../src/lib/flower.js'
import { toFlowerRow } from '../src/lib/naming.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.resolve(ROOT, process.env.GARDEN_TEST_OUTPUT || '.qa-browser/garden-themes')
const BUILD = path.join(ROOT, '.qa-production')
const PROFILE = path.join(ROOT, '.qa-production-profile')
const ORIGIN = 'http://127.0.0.1:4175'
const API = 'https://garden-theme-qa.supabase.co'
const exec = promisify(execFile)
const expect = playwrightExpect.configure({ timeout: 30000 })
const names = { balanced: 'Balanced Warm', warm: 'Warm Opal', aurora: 'Aurora Crystal', default: 'Original Opal' }
const accounts = [
  { id: '11111111-1111-4111-8111-111111111111', email: 'garden-a@example.test', nickname: 'Theme A', member: 'member-a', garden: 'garden-a', code: '123456' },
  { id: '22222222-2222-4222-8222-222222222222', email: 'garden-b@example.test', nickname: 'Theme B', member: 'member-b', garden: 'garden-b', code: '654321' },
]
const friend = { user_id: '33333333-3333-4333-8333-333333333333', member_id: 'member-friend', nickname: 'Garden Friend', since: '2026-01-01T10:00:00Z' }
const keyFor = account => `sup.garden-theme.v1.user.${account.id}`
const results = { started: new Date().toISOString(), testMode: 'Production Vite build, actual App/auth/Garden/detail code; locally mocked Supabase and synthetic WAV audio', checks: [], screenshots: [], consoleErrors: [], pageErrors: [], unexpectedRequests: [], mutations: [] }
mkdirSync(OUT, { recursive: true })

function session(account) {
  const exp = Math.floor(Date.now() / 1000) + 3600
  const jwt = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: account.id, aud: 'authenticated', exp })).toString('base64url'), 'test-signature'].join('.')
  return { access_token: jwt, refresh_token: `test-refresh-${account.member}`, expires_in: 3600, expires_at: exp, token_type: 'bearer', user: { id: account.id, aud: 'authenticated', role: 'authenticated', email: account.email, email_confirmed_at: '2026-01-01T00:00:00Z', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [], created_at: '2026-01-01T00:00:00Z', is_anonymous: false } }
}

function flower(id, category, sender, day, extra = {}) {
  const features = { rms: 0.045, centroid: 2400, attack: 0.18, onsets: 5, sustain: 0.55, envelope: [0.8, 0.6, 0.9, 0.65, 0.7], ...extra }
  const kind = category === 'sound' ? 'sound' : 'voice'
  const built = kind === 'voice' ? buildFlower(category, features, 1) : buildSoundFlower(features)
  return { id, garden_id: sender === friend.member_id ? 'friend-garden' : 'garden-a', sender_id: sender, ...toFlowerRow({ flower: built, features, kind, category, transcript: kind === 'voice' ? 'A sound memory for theme verification' : null }), audio_path: `${id}.wav`, sent_date: `2026-01-${String(day).padStart(2, '0')}`, created_at: `2026-01-${String(day).padStart(2, '0')}T10:00:00Z` }
}
const received = ['cozy', 'joy', 'flutter', 'excited', 'calm', 'sad', 'tense'].map((category, i) => flower(`received-${category}`, category, friend.member_id, i + 1))
received.push(flower('tree-round', 'sound', friend.member_id, 8, { attack: 0.05, sustain: 0.1 }), flower('tree-pine', 'sound', friend.member_id, 9, { attack: 0.95, sustain: 0.1 }), flower('tree-willow', 'sound', friend.member_id, 10, { attack: 0.05, sustain: 0.95 }))
const ownFlower = account => flower(`own-${account.member}`, 'flutter', account.member, 1)

function wav() {
  const sampleRate = 8000, samples = sampleRate * 60
  const data = Buffer.alloc(44 + samples * 2)
  data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVE', 8); data.write('fmt ', 12)
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22); data.writeUInt32LE(sampleRate, 24)
  data.writeUInt32LE(sampleRate * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(samples * 2, 40)
  for (let i = 0; i < samples; i++) data.writeInt16LE(Math.round(Math.sin(i / sampleRate * Math.PI * 2 * 330) * 900), 44 + i * 2)
  return data
}
const audio = wav()
let activeAccount = accounts[0]
async function mockNetwork(context) {
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url())
    if (url.origin === ORIGIN && url.pathname === '/theme-settings-fixture') {
      // A same-origin document can update the personal preference without starting a
      // second WebGL renderer; the real Me selector is exercised separately above.
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Local preference writer</title>' })
    }
    if (url.origin === ORIGIN) return route.continue()
    if (url.href === 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css') {
      return route.fulfill({ status: 200, contentType: 'text/css', body: '/* Offline verification uses the application font fallback. */' })
    }
    if (url.origin !== API) {
      results.unexpectedRequests.push({ url: url.href, method: request.method() })
      return route.abort()
    }
    const method = request.method(), pathname = url.pathname
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }
    const reply = data => route.fulfill({ status: 200, headers, json: data })
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (pathname === '/auth/v1/token') {
      const body = request.postDataJSON()
      activeAccount = accounts.find(a => a.email === body.email || body.refresh_token === `test-refresh-${a.member}`) || activeAccount
      return reply(session(activeAccount))
    }
    if (pathname === '/auth/v1/user') return reply(session(activeAccount).user)
    if (pathname === '/auth/v1/logout') return route.fulfill({ status: 204, headers })
    if (pathname.startsWith('/storage/v1/object/sign/')) return reply({ signedURL: `/object/public/sounds/test.wav` })
    if (pathname.startsWith('/storage/v1/object/public/')) return route.fulfill({ status: 200, headers, contentType: 'audio/wav', body: audio })
    if (pathname === '/functions/v1/sound-push') return reply({ publicKey: null })
    if (pathname === '/rest/v1/rpc/my_friends') return reply([friend])
    if (pathname === '/rest/v1/rpc/update_profile') {
      const body = request.postDataJSON()
      activeAccount.nickname = body.p_nickname
      results.mutations.push({ operation: 'update_profile', body })
      return reply(null)
    }
    if (pathname === '/rest/v1/rpc/visit_flowers') return reply(received)
    if (method !== 'GET') {
      results.mutations.push({ operation: pathname, method, body: request.postData() })
      return reply([])
    }
    if (pathname === '/rest/v1/members') {
      if (url.searchParams.has('user_id')) return reply([{ id: activeAccount.member, garden_id: activeAccount.garden, gardens: { code: activeAccount.code } }])
      return reply([{ id: activeAccount.member, garden_id: activeAccount.garden, user_id: activeAccount.id, nickname: activeAccount.nickname, created_at: '2026-01-01T00:00:00Z' }])
    }
    if (pathname === '/rest/v1/gardens') return reply({ id: activeAccount.garden, code: activeAccount.code })
    if (pathname === '/rest/v1/flowers') return reply([ownFlower(activeAccount)])
    if (pathname === '/rest/v1/shares') {
      if (url.searchParams.has('from_user')) return reply([{ id: 'sent-share', flower_id: ownFlower(activeAccount).id, to_user: friend.user_id, created_at: '2026-01-01T09:00:00Z', status: 'accepted' }])
      return reply(received.map((f, i) => ({ id: `received-share-${i}`, flower_id: f.id, from_user: friend.user_id, to_user: activeAccount.id, status: 'accepted', created_at: f.created_at, flower: f })))
    }
    results.unexpectedRequests.push({ url: url.href, method })
    return route.fulfill({ status: 404, headers, json: { message: 'Unmocked fixture route' } })
  })
  await context.routeWebSocket('**/realtime/v1/websocket*', socket => {
    socket.onMessage(message => {
      try {
        const value = JSON.parse(String(message))
        if (value.event === 'phx_join' || value.event === 'heartbeat') socket.send(JSON.stringify({ topic: value.topic, event: 'phx_reply', payload: { status: 'ok', response: { postgres_changes: [] } }, ref: value.ref }))
      } catch {}
    })
  })
}

function observe(page) {
  page.on('pageerror', error => results.pageErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') results.consoleErrors.push(message.text()) })
  // Observe the first rendered theme on every navigation, including after restarting Edge.
  return page.addInitScript(() => {
    window.__qaObservedThemes = []
    new MutationObserver(() => {
      const value = document.querySelector('[data-garden-theme]')?.dataset.gardenTheme
      if (value && window.__qaObservedThemes.at(-1) !== value) window.__qaObservedThemes.push(value)
    }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-garden-theme'] })
  })
}

async function nav(page, label) {
  await page.getByRole('button', { name: '메뉴', exact: true }).click()
  await page.locator('.menu-nav').getByRole('button', { name: label, exact: true }).click()
}
async function assertTone(page, tone) {
  await expect(page.locator('.home')).toHaveAttribute('data-garden-theme', tone)
  await expect(page.locator('.island canvas')).toHaveCount(1)
  await expect(page.locator('.island')).toHaveAttribute('data-tone', tone)
  await expect(page.locator('.island')).toHaveAttribute('data-ready', 'loaded')
  await expect(page.locator('.island')).toHaveAttribute('data-plants', '11')
}
async function choose(page, tone) {
  await nav(page, '나')
  const button = page.getByRole('button', { name: names[tone], exact: true })
  await button.click()
  await expect(button).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.garden-theme-option[aria-pressed="true"]')).toHaveCount(1)
  await nav(page, '정원')
  await assertTone(page, tone)
}
async function login(page, account) {
  await page.locator('input[type="email"]').fill(account.email)
  await page.locator('input[type="password"]').fill('local-test-password')
  await page.locator('form').getByRole('button', { name: '로그인', exact: true }).click()
  await page.locator('.home').waitFor()
}
async function check(name, run) {
  const started = Date.now()
  await run()
  results.checks.push({ name, passed: true, milliseconds: Date.now() - started })
  console.log(`PASS ${name}`)
}

let context, server
try {
  if (!process.argv.includes('--skip-build')) {
    const build = await exec(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', '.qa-production'], { cwd: ROOT, env: { ...process.env, VITE_SUPABASE_URL: API, VITE_SUPABASE_ANON_KEY: 'qa-public-key', VITE_BASE: '/' }, maxBuffer: 8 * 1024 * 1024 })
    results.build = { passed: true, output: build.stdout + build.stderr }
  }
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' }
  server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, ORIGIN).pathname)
    const target = path.resolve(BUILD, '.' + (pathname === '/' ? '/index.html' : pathname))
    if (!target.startsWith(BUILD + path.sep) || !existsSync(target)) { response.writeHead(404); response.end(); return }
    response.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' })
    response.end(readFileSync(target))
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(4175, '127.0.0.1', resolve) })
  const channel = process.env.GARDEN_TEST_BROWSER || (existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe') ? 'chrome' : 'msedge')
  const launch = async () => {
    const next = await chromium.launchPersistentContext(PROFILE, { channel, headless: true, viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, args: ['--autoplay-policy=no-user-gesture-required'], serviceWorkers: 'block' })
    await mockNetwork(next)
    return next
  }
  context = await launch()
  results.browser = { channel, version: context.browser()?.version(), rendering: 'headless native WebGL', viewport: '1280x900' }
  let page = await context.newPage()
  await observe(page)
  await page.goto(ORIGIN)
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await check('Fresh authenticated user receives Balanced Warm on its first painted garden', async () => {
    await login(page, accounts[0])
    await assertTone(page, 'balanced')
    results.browser.glRenderer = await page.locator('.island canvas').evaluate(canvas => {
      const gl = canvas.getContext('webgl2')
      const debug = gl?.getExtension('WEBGL_debug_renderer_info')
      return debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER)
    })
    assert.deepEqual(await page.evaluate(() => window.__qaObservedThemes), ['balanced'])
    await nav(page, '나')
    await expect(page.getByRole('button', { name: 'Balanced Warm', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: '프로필 사진', exact: true })).toBeVisible()
    await expect(page.getByRole('textbox', { name: '친구 코드', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '로그아웃', exact: true })).toBeVisible()
    await nav(page, '정원')
  })
  const sourceSnapshot = JSON.stringify(received)
  await check('All four themes switch through Me immediately, with the same island canvas and no garden writes', async () => {
    await page.locator('.island canvas').evaluate(canvas => { canvas.dataset.qaIdentity = 'persistent-island' })
    const mutationsBefore = results.mutations.length
    for (const tone of ['balanced', 'warm', 'aurora', 'default']) {
      await choose(page, tone)
      await expect(page.locator('.island canvas')).toHaveAttribute('data-qa-identity', 'persistent-island')
      assert.equal(await page.evaluate(key => localStorage.getItem(key), keyFor(accounts[0])), tone)
      await page.waitForTimeout(2000)
      const screenshot = `production-${tone}.png`
      await page.screenshot({ path: path.join(OUT, screenshot) })
      results.screenshots.push(screenshot)
      await nav(page, '앨범')
      await page.locator('.album-item:not(.pair)').filter({ hasText: received[0].name }).click()
      await expect(page.locator('.bloom3d')).toHaveAttribute('data-tone', tone)
      await expect(page.locator('.bloom3d')).toHaveAttribute('data-flora', 'blender')
      await page.getByRole('button', { name: '닫기', exact: true }).click()
      await page.locator('.album-item.pair').click()
      await expect(page.locator('.bloom3d')).toHaveAttribute('data-tone', tone)
      await expect(page.locator('.bloom3d')).toHaveAttribute('data-flora', 'pair')
      await expect(page.locator('.sound-player audio')).toHaveAttribute('src', /^blob:/)
      await page.getByRole('button', { name: '닫기', exact: true }).click()
      await nav(page, '정원')
    }
    assert.equal(results.mutations.length, mutationsBefore)
    assert.equal(JSON.stringify(received), sourceSnapshot)
  })
  await check('Refresh restores the chosen theme without a temporary Balanced frame', async () => {
    await choose(page, 'warm')
    await page.reload()
    await assertTone(page, 'warm')
    assert.deepEqual(await page.evaluate(() => window.__qaObservedThemes), ['warm'])
  })
  await check('Browser process restart retains the user preference on the same device', async () => {
    await context.close()
    context = await launch()
    page = await context.newPage()
    await observe(page)
    await page.goto(ORIGIN)
    await assertTone(page, 'warm')
    assert.deepEqual(await page.evaluate(() => window.__qaObservedThemes), ['warm'])
  })
  await check('Logout/login isolates authenticated user IDs and does not consume the demo preference', async () => {
    await page.evaluate(() => localStorage.setItem('sup.garden-theme.v1.demo', 'aurora'))
    await nav(page, '나')
    await page.getByRole('button', { name: '로그아웃', exact: true }).click()
    await login(page, accounts[1])
    await assertTone(page, 'balanced')
    await choose(page, 'default')
    await nav(page, '나')
    await page.getByRole('button', { name: '로그아웃', exact: true }).click()
    await login(page, accounts[0])
    await assertTone(page, 'warm')
    const values = await page.evaluate(keys => keys.map(key => localStorage.getItem(key)), [keyFor(accounts[0]), keyFor(accounts[1]), 'sup.garden-theme.v1.demo'])
    assert.deepEqual(values, ['warm', 'default', 'aurora'])
  })
  await check('Corrupted stored theme restores Balanced Warm before first paint', async () => {
    await page.evaluate(key => localStorage.setItem(key, '{broken-json'), keyFor(accounts[0]))
    await page.reload()
    await assertTone(page, 'balanced')
    assert.deepEqual(await page.evaluate(() => window.__qaObservedThemes), ['balanced'])
  })
  await check('Profile nickname editing and friend navigation remain available', async () => {
    await nav(page, '나')
    await page.getByRole('textbox', { name: '닉네임', exact: true }).fill('Theme Edited')
    await page.getByRole('textbox', { name: '닉네임', exact: true }).press('Enter')
    await expect.poll(() => results.mutations.filter(m => m.operation === 'update_profile').length).toBe(1)
    await nav(page, '정원')
    await expect(page.getByRole('button', { name: 'Theme Edited의 정원 시점 초기화' })).toBeVisible()
    await nav(page, '친구')
    await expect(page.getByText('Garden Friend', { exact: true }).first()).toBeVisible()
    await nav(page, '정원')
  })
  await check('Open detail, audio and its playback position survive an external same-user theme update', async () => {
    await nav(page, '앨범')
    await page.locator('.album-item.pair').click()
    await expect(page.locator('.sound-player audio')).toHaveAttribute('src', /^blob:/)
    await page.locator('.sound-play').click()
    await expect.poll(() => page.locator('audio').evaluate(a => !a.paused && a.currentTime > 0.1)).toBe(true)
    const before = await page.locator('audio').evaluate(a => { a.dataset.qaIdentity = 'same-audio'; return { src: a.src, time: a.currentTime } })
    await page.evaluate(() => {
      window.__qaStorageEvents = []
      window.addEventListener('storage', event => window.__qaStorageEvents.push({ key: event.key, value: event.newValue }))
    })
    const settings = await context.newPage()
    await settings.goto(`${ORIGIN}/theme-settings-fixture`)
    await settings.evaluate(key => localStorage.setItem(key, 'aurora'), keyFor(accounts[0]))
    await page.bringToFront()
    await expect.poll(() => page.evaluate(() => window.__qaStorageEvents)).toContainEqual({ key: keyFor(accounts[0]), value: 'aurora' })
    await expect(page.locator('.bloom3d')).toHaveAttribute('data-tone', 'aurora')
    const after = await page.locator('audio').evaluate(a => ({ src: a.src, time: a.currentTime, paused: a.paused, identity: a.dataset.qaIdentity }))
    assert.equal(after.src, before.src)
    assert.equal(after.identity, 'same-audio')
    assert.equal(after.paused, false)
    assert.ok(after.time > before.time)
    await settings.close()
    await page.getByRole('button', { name: '닫기', exact: true }).click()
    await nav(page, '정원')
  })
  await check('Mobile Me layout has four selectable themes without horizontal overflow', async () => {
    await page.setViewportSize({ width: 390, height: 844 })
    await nav(page, '나')
    await expect(page.locator('.garden-theme-option')).toHaveCount(4)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    for (const tone of Object.keys(names)) {
      await page.getByRole('button', { name: names[tone], exact: true }).click()
      await expect(page.getByRole('button', { name: names[tone], exact: true })).toHaveAttribute('aria-pressed', 'true')
    }
    await page.screenshot({ path: path.join(OUT, 'production-mobile-me.png') })
    results.screenshots.push('production-mobile-me.png')
  })
  assert.deepEqual(results.pageErrors, [])
  assert.deepEqual(results.unexpectedRequests, [])
  assert.equal(results.consoleErrors.some(message => /shader|WebGL|THREE|TypeError|ReferenceError/i.test(message)), false)
  results.passed = true
  results.limitations = ['Supabase, authentication, profile RPC responses and audio storage are local fixtures; no live account or database was changed.', 'Dense-garden performance is reported by the separate renderer verification.', 'The external Pretendard font stylesheet is stubbed for offline reproducibility; screenshots use the application font fallback.', 'Push notifications are not tested; service workers are blocked to isolate local fixtures.']
} catch (error) {
  results.passed = false
  results.failure = error.stack || String(error)
  console.error(error)
  try { await context?.pages().at(-1)?.screenshot({ path: path.join(OUT, 'production-failure.png') }) } catch {}
  process.exitCode = 1
} finally {
  results.finished = new Date().toISOString()
  writeFileSync(path.join(OUT, 'production-results.json'), JSON.stringify(results, null, 2) + '\n')
  await context?.close()
  await new Promise(resolve => server ? server.close(resolve) : resolve())
}
