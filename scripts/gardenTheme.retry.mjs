// Retry the canonical island while changing themes through the actual Garden UI.
// Run against the development fixture: node scripts/gardenTheme.retry.mjs
import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

const base = process.env.GARDEN_TEST_URL || 'http://127.0.0.1:5199'
const output = process.env.GARDEN_TEST_OUTPUT || '.qa-browser/garden-themes'
const names = { balanced: 'Balanced Warm', warm: 'Warm Opal', aurora: 'Aurora Crystal', default: 'Original Opal' }
const islandRoute = '**/models/island-modern.glb'
const isCanonical = url => /\/models\/island-modern\.glb$/.test(url)
const report = {
  started: new Date().toISOString(), browser: 'Chrome headless',
  checks: [], expectedNetworkErrors: [], runtimeErrors: [], shaderWarnings: [],
  unexpectedRequestFailures: [], islandRequests: [],
}
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 })
const page = await context.newPage()
let injectingFailure = false
await context.route('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css', route => route.fulfill({ contentType: 'text/css', body: '' }))
page.on('request', request => {
  if (/\/models\/island[^/]*\.glb$/.test(request.url())) report.islandRequests.push(request.url())
})
page.on('pageerror', error => report.runtimeErrors.push(error.message))
page.on('console', message => {
  const record = { text: message.text(), url: message.location().url }
  if (message.type() === 'error') {
    if (injectingFailure && /net::ERR_FAILED/.test(record.text) && isCanonical(record.url)) {
      report.expectedNetworkErrors.push({ event: 'console', ...record })
    } else report.runtimeErrors.push(record)
  }
  if (message.type() === 'warning' && /shader|WebGL|GL_INVALID|context lost/i.test(record.text)) report.shaderWarnings.push(record)
})
page.on('requestfailed', request => {
  const record = { event: 'requestfailed', url: request.url(), error: request.failure()?.errorText }
  if (injectingFailure && isCanonical(record.url)) report.expectedNetworkErrors.push(record)
  else report.unexpectedRequestFailures.push(record)
})
const check = label => { report.checks.push(label); console.log(`PASS ${label}`) }
const snapshot = () => page.evaluate(() => window.__gardenDiagnostics.current.snapshot())
const waitReady = tone => page.waitForFunction(t => {
  const state = window.__gardenDiagnostics?.current?.snapshot()
  return state?.themeStatus === 'loaded' && state.tone === t
}, tone, { timeout: 60000 })
const openTab = async name => {
  await page.getByRole('button', { name: '메뉴', exact: true }).click()
  await page.locator('.menu-nav').getByRole('button', { name, exact: true }).click()
}
const identity = state => state.plantStates.map(({ id, position, bornAt, opened, lod }) => ({ id, position, bornAt, opened, lod })).sort((a, b) => a.id.localeCompare(b.id))
const sameCamera = (expected, actual) => {
  for (const key of ['position', 'target']) expected[key].forEach((value, i) => {
    assert.ok(Math.abs(value - actual[key][i]) < 0.000001, `${key}[${i}] changed during a theme request`)
  })
}

try {
  injectingFailure = true
  await page.route(islandRoute, route => route.abort('failed'))
  await page.goto(`${base}/?view=home&friends=3&many=12&diagnostics=1`)
  await page.waitForFunction(() => {
    const state = window.__gardenDiagnostics?.current?.snapshot()
    return state?.themeStatus === 'error' && state.plants > 0 && state.opened === state.plants
  })
  await page.evaluate(() => {
    window.__gardenDiagnostics.current.setCamera({ position: [3.8, 4.9, 12.2], target: [0, 0.1, 0] })
    window.__gardenDiagnostics.current.freeze(12)
    window.__retryOriginalCanvas = document.querySelector('.island canvas')
  })
  await page.waitForTimeout(250)
  report.initial = await snapshot()

  await openTab('나')
  assert.equal(report.initial.tone, 'balanced')
  assert.equal(report.initial.island, 'fallback')
  assert.ok(report.initial.islandChildren > 0)
  await expect(page.locator('.garden-theme-settings').getByRole('button', { name: '다시 시도', exact: true })).toBeVisible()
  await expect(page.locator('.island')).toHaveAttribute('data-ready', 'error')
  assert.ok(report.expectedNetworkErrors.some(error => error.event === 'requestfailed'))
  check('An injected canonical GLB failure leaves the planted fallback visible and Me offers retry')

  await page.unroute(islandRoute)
  injectingFailure = false
  let release
  const pending = new Promise(resolve => { release = resolve })
  await page.route(islandRoute, async route => { await pending; await route.continue() })
  await page.locator('.garden-theme-settings').getByRole('button', { name: '다시 시도', exact: true }).click()
  const rapidThemes = ['aurora', 'default', 'balanced', 'warm', 'default', 'aurora']
  try {
    for (const tone of rapidThemes) {
      await page.getByRole('button', { name: names[tone], exact: true }).click()
      const state = await snapshot()
      assert.equal(state.themeStatus, 'loading')
      assert.ok(state.islandChildren > 0)
      assert.deepEqual(identity(state), identity(report.initial))
    }
  } finally { release() }
  await waitReady('aurora')
  await expect(page.locator('.garden-theme-settings').getByRole('button', { name: '다시 시도', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: names.aurora, exact: true })).toHaveAttribute('aria-pressed', 'true')
  await openTab('정원')
  await page.waitForTimeout(300)
  report.afterRapidSwitches = await snapshot()
  assert.equal(report.afterRapidSwitches.tone, 'aurora')
  assert.equal(report.afterRapidSwitches.requestedTone, 'aurora')
  assert.equal(report.afterRapidSwitches.themeStatus, 'loaded')
  assert.equal(report.afterRapidSwitches.islandGeometry.assetTriangles, 14025)
  assert.deepEqual(identity(report.afterRapidSwitches), identity(report.initial))
  sameCamera(report.initial.camera, report.afterRapidSwitches.camera)
  assert.equal(await page.evaluate(() => window.__retryOriginalCanvas === document.querySelector('.island canvas')), true)
  assert.equal(await page.evaluate(() => localStorage.getItem('sup.garden-theme.v1.demo')), 'aurora')
  assert.equal(report.islandRequests.length, 2)
  assert.ok(report.islandRequests.every(isCanonical))
  check('Six choices during retry share one in-flight GLB. The last choice applies with the original canvas, camera and plants')
  assert.deepEqual(report.runtimeErrors, [])
  assert.deepEqual(report.shaderWarnings, [])
  assert.deepEqual(report.unexpectedRequestFailures, [])
  check('Only the intentionally injected network failure occurred; no runtime, shader or unexpected resource errors')
  report.passed = true
} catch (error) {
  report.passed = false
  report.failure = error.stack
  console.error(error)
  process.exitCode = 1
} finally {
  report.finished = new Date().toISOString()
  await writeFile(`${output}/retry-results.json`, JSON.stringify(report, null, 2))
  await browser.close()
}
