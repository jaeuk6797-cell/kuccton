// Focused regression coverage after merging origin/main's friend removal and safe-area work.
// Run with the existing dev server: node scripts/gardenTheme.merge.browser.mjs
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium, expect as playwrightExpect } from '@playwright/test'

const expect = playwrightExpect.configure({ timeout: 20000 })
const base = process.env.GARDEN_TEST_URL || 'http://127.0.0.1:5199'
const output = '.qa-browser'
const themeKey = 'sup.garden-theme.v1.demo'
const hiddenKey = 'sup.hidden-friend-sounds.v1.demo'
const pinKey = 'sup.pinned-friends.v1.demo'
const names = { balanced: 'Balanced Warm', warm: 'Warm Opal', aurora: 'Aurora Crystal', default: 'Original Opal' }
const report = { started: new Date().toISOString(), checks: [], scenarios: {}, errors: [], limitations: ['Uses the actual Garden with development fixtures, not live accounts or the friend-removal RPC.', 'Demo friend membership resets on reload; local hide, pin and theme preferences persist and are verified.', 'Android system-bar values are simulated through the native bridge CSS properties; no physical Android device is used.'] }
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: process.env.GARDEN_TEST_BROWSER || 'chrome', headless: true })
report.browser = browser.version()
let currentPage
const snapshot = page => page.evaluate(() => window.__gardenDiagnostics.current.snapshot())
const ids = state => state.plantStates.map(plant => plant.id).sort()
const positions = state => state.plantStates.map(({ id, position }) => ({ id, position })).sort((a, b) => a.id.localeCompare(b.id))
const readStored = (page, key) => page.evaluate(k => JSON.parse(localStorage.getItem(k)), key)
async function ready(page, tone) {
  await page.waitForFunction(expected => {
    const state = window.__gardenDiagnostics?.current?.snapshot()
    return state?.island === 'loaded' && (!expected || state.tone === expected)
  }, tone, { timeout: 60000 })
}
async function tab(page, name) {
  await page.getByRole('button', { name: '메뉴', exact: true }).click()
  await page.locator('.menu-nav').getByRole('button', { name, exact: true }).click()
}
async function choose(page, tone) {
  await tab(page, '나')
  await page.getByRole('button', { name: names[tone], exact: true }).click()
  await expect(page.getByRole('button', { name: names[tone], exact: true })).toHaveAttribute('aria-pressed', 'true')
  await ready(page, tone)
  assert.equal(await page.evaluate(key => localStorage.getItem(key), themeKey), tone)
  await tab(page, '정원')
}
async function pageFor(options = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, timezoneId: 'Asia/Seoul', ...options })
  // Freeze only Date, leaving RAF, performance.now and real timers operational.
  await context.addInitScript(value => {
    const OriginalDate = Date
    globalThis.Date = class extends OriginalDate {
      constructor(...args) { super(...(args.length ? args : [value])) }
      static now() { return value }
    }
  }, Date.parse('2026-01-15T03:00:00Z'))
  await context.route('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css', route => route.fulfill({ contentType: 'text/css', body: '/* Offline test: application font fallback. */' }))
  const page = await context.newPage()
  currentPage = page
  page.on('pageerror', error => report.errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()) })
  await page.goto(`${base}/?view=home&friends=3&diagnostics=1`)
  await ready(page, 'balanced')
  await page.waitForFunction(() => {
    const state = window.__gardenDiagnostics.current.snapshot()
    return state.plants > 0 && state.opened === state.plants
  })
  return { context, page }
}
function pass(name) { report.checks.push(name); console.log(`PASS ${name}`) }
async function albumRows(page) {
  await tab(page, '앨범')
  const rows = await page.locator('.album-item').evaluateAll(items => items.map(item => ({ name: item.querySelector('b')?.textContent, author: item.querySelector('small')?.textContent, pair: item.classList.contains('pair') })))
  await tab(page, '정원')
  return rows
}

try {
  for (const hide of [false, true]) {
    const { context, page } = await pageFor()
    const scenario = hide ? 'hide' : 'keep'
    const tone = hide ? 'aurora' : 'warm'
    const before = await snapshot(page)
    const rowsBefore = await albumRows(page)
    const targetPairs = before.plantStates.filter(plant => plant.kind === 'pair' && plant.id.startsWith('pair-u-jae-')).map(plant => plant.id)
    assert.equal(targetPairs.length, 1, 'Fixture includes the selected friend pair')
    await expect.poll(() => readStored(page, pinKey)).toEqual(['u-jae', 'u-min', 'u-sky'])
    await choose(page, tone)
    await tab(page, '친구')
    await page.locator('.friend-row').filter({ has: page.locator('b', { hasText: /^재욱$/ }) }).click()
    await page.getByRole('button', { name: '친구 삭제', exact: true }).click()
    await expect(page.getByRole('radio', { name: '꽃 남기기', exact: true })).toBeChecked()
    if (hide) await page.getByRole('radio', { name: '화면에서 숨기기', exact: true }).check()
    await page.getByRole('button', { name: '친구 삭제하기', exact: true }).click()
    await expect(page.locator('.friend-row')).toHaveCount(2)
    await expect(page.locator('.friend-row b').filter({ hasText: /^재욱$/ })).toHaveCount(0)
    await expect.poll(() => readStored(page, pinKey)).toEqual(['u-min', 'u-sky'])
    await tab(page, '정원')
    await ready(page, tone)
    const after = await snapshot(page)
    const rowsAfter = await albumRows(page)
    const hidden = await readStored(page, hiddenKey)
    assert.equal(await page.evaluate(key => localStorage.getItem(key), themeKey), tone)
    assert.equal(await page.locator('.home').getAttribute('data-garden-theme'), tone)
    if (!hide) {
      assert.deepEqual(ids(after), ids(before), 'Keep option retains every flower, tree and pair ID')
      assert.deepEqual(positions(after), positions(before), 'Keep option retains plant positions')
      assert.deepEqual(rowsAfter.map(row => row.name).sort(), rowsBefore.map(row => row.name).sort(), 'Keep option retains album entries')
      assert.deepEqual(hidden, { shares: [], pairs: [] })
      pass('Friend deletion with Keep flowers retains all plant identities, positions and album entries; theme and remaining pins survive')
    } else {
      assert.deepEqual([...hidden.shares].sort(), ['share-accepted-0', 'share-accepted-1', 'share-accepted-2', 'share-declined', 'share-waiting'].sort(), 'Only selected friend shares are hidden, including pending and declined sounds')
      assert.deepEqual(hidden.pairs, targetPairs)
      assert.equal(before.plants - after.plants, 3 + targetPairs.length, 'Only selected friend planted sounds and pair are removed')
      assert.ok(ids(after).every(id => ids(before).includes(id)), 'Hiding does not invent or alter surviving flower identities')
      assert.deepEqual(after.plantStates.filter(plant => plant.kind === 'pair').map(plant => plant.id).sort(), before.plantStates.filter(plant => plant.kind === 'pair' && !targetPairs.includes(plant.id)).map(plant => plant.id).sort())
      for (const friend of ['민지', '하늘']) assert.deepEqual(rowsAfter.filter(row => row.author === friend), rowsBefore.filter(row => row.author === friend), 'Other friends album entries remain intact')
      assert.equal(rowsAfter.length, rowsBefore.length - rowsBefore.filter(row => row.author === '재욱').length - targetPairs.length)
      await choose(page, 'default')
      assert.deepEqual(ids(await snapshot(page)), ids(after), 'Switching theme does not restore hidden sounds')
      pass('Friend deletion with Hide affects only that friend’s local sounds/pair; other friends and subsequent theme switches remain intact')
    }
    await page.reload()
    await ready(page, hide ? 'default' : tone)
    const restored = await snapshot(page)
    assert.deepEqual(ids(restored), ids(after), 'Reload restores the retained/hidden scene with the stored theme')
    assert.deepEqual(await readStored(page, hiddenKey), hidden)
    await expect.poll(() => readStored(page, pinKey)).toEqual(['u-min', 'u-sky'])
    await page.getByRole('button', { name: '친구 선택 및 고정', exact: true }).click()
    await expect(page.getByRole('button', { name: '재욱 상단 고정', exact: true })).toHaveAttribute('aria-pressed', 'false')
    await page.getByRole('button', { name: '닫기', exact: true }).click()
    report.scenarios[scenario] = { before: ids(before), after: ids(after), restored: ids(restored), hidden, themeAfterReload: restored.tone }
    pass(`${hide ? 'Hide' : 'Keep'} preferences, pin cleanup and theme survive reload (demo membership itself resets)`)
    await context.close()
  }

  const { context, page } = await pageFor({ isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36' })
  await page.locator('.island canvas').evaluate(canvas => { canvas.dataset.mergeIdentity = 'same-renderer' })
  const layout = () => page.evaluate(() => {
    const home = document.querySelector('.home'), title = document.querySelector('.home-title'), sheet = document.querySelector('.home-sheet'), menu = document.querySelector('.menu-btn')
    const homeStyle = getComputedStyle(home), sheetStyle = getComputedStyle(sheet)
    const rect = element => { const { top, right, bottom, left, width, height } = element.getBoundingClientRect(); return { top, right, bottom, left, width, height } }
    return { home: rect(home), title: rect(title), sheet: rect(sheet), menu: rect(menu), top: parseFloat(homeStyle.getPropertyValue('--island-top')), expectedTop: title.offsetTop + title.offsetHeight + 12, bottom: parseFloat(homeStyle.getPropertyValue('--island-bottom')), expectedBottom: parseFloat(sheetStyle.bottom) + sheet.offsetHeight + 12, overflow: document.documentElement.scrollWidth > innerWidth }
  })
  report.safeAreas = []
  for (const [top, bottom, left, right] of [[0, 0, 0, 0], [32, 24, 28, 30], [64, 48, 36, 40]]) {
    await page.evaluate(values => ['top', 'bottom', 'left', 'right'].forEach((edge, i) => document.documentElement.style.setProperty(`--safe-area-inset-${edge}`, `${values[i]}px`)), [top, bottom, left, right])
    await expect.poll(async () => {
      const value = await layout()
      return Math.abs(value.top - value.expectedTop) < 1 && Math.abs(value.bottom - value.expectedBottom) < 1 && Math.abs(value.menu.top - value.home.top - top - 30) < 1
    }).toBe(true)
    const value = await layout()
    assert.ok(Math.abs(value.title.top - value.home.top - top - 22) < 1)
    assert.ok(Math.abs(value.title.left - value.home.left - Math.max(20, left)) < 1)
    assert.ok(Math.abs(value.home.right - value.menu.right - Math.max(20, right)) < 1)
    assert.ok(Math.abs(value.home.bottom - value.sheet.bottom - Math.max(12, bottom)) < 1)
    assert.equal(value.overflow, false)
    report.safeAreas.push({ input: { top, bottom, left, right }, measured: value })
  }
  await choose(page, 'aurora')
  await expect(page.locator('.island canvas')).toHaveAttribute('data-merge-identity', 'same-renderer')
  await page.screenshot({ path: `${output}/merge-safearea-portrait.png` })
  await page.setViewportSize({ width: 844, height: 390 })
  await expect.poll(async () => (await layout()).home.height).toBe(390)
  const landscape = await layout()
  assert.equal(landscape.overflow, false)
  assert.ok(Math.abs(landscape.top - landscape.expectedTop) < 1)
  assert.ok(Math.abs(landscape.bottom - landscape.expectedBottom) < 1)
  assert.ok(landscape.home.width <= 520)
  await page.screenshot({ path: `${output}/merge-safearea-landscape.png` })
  report.landscape = landscape
  pass('Late Android safe-area updates and rotation recompute garden bounds; menu, title and tools remain inset through a theme switch')
  await context.close()
  assert.deepEqual(report.errors, [], 'No browser runtime, resource or shader errors')
  report.passed = true
} catch (error) {
  report.passed = false
  report.failure = error.stack || String(error)
  console.error(error)
  try { await currentPage?.screenshot({ path: `${output}/merge-failure.png` }) } catch {}
  process.exitCode = 1
} finally {
  report.finished = new Date().toISOString()
  await writeFile(`${output}/merge-results.json`, JSON.stringify(report, null, 2) + '\n')
  await browser.close()
}
