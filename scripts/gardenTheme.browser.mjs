import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

const base = process.env.GARDEN_TEST_URL || 'http://127.0.0.1:5199'
const directory = process.env.GARDEN_TEST_OUTPUT || '.qa-browser/garden-themes'
const names = { balanced: 'Balanced Warm', warm: 'Warm Opal', aurora: 'Aurora Crystal', default: 'Original Opal' }
const themes = Object.keys(names)
const key = 'sup.garden-theme.v1.demo'
const report = { browser: 'Chrome headless, native GPU', viewport: { width: 1280, height: 900 }, checks: [], samples: {}, errors: [] }
await mkdir(directory, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ viewport: report.viewport, deviceScaleFactor: 1 })
await context.route('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css', route => route.fulfill({ contentType: 'text/css', body: '' }))
const page = await context.newPage()
const modelRequests = []
page.on('request', request => { if (/\/models\/island[^/]*\.glb$/.test(request.url())) modelRequests.push(request.url()) })
page.on('pageerror', e => report.errors.push(e.message))
page.on('console', e => { if (e.type() === 'error') report.errors.push(e.text()) })
const snapshot = () => page.evaluate(() => window.__gardenDiagnostics.current.snapshot())
const paint = () => page.evaluate(() => window.__gardenDiagnostics.current.islandPaint())
const waitReady = tone => page.waitForFunction(t => {
  const s = window.__gardenDiagnostics?.current?.snapshot()
  return s?.island === 'loaded' && (!t || s.tone === t)
}, tone, { timeout: 60000 })
const openTab = async name => {
  await page.getByRole('button', { name: '메뉴', exact: true }).click()
  await page.locator('.menu-nav').getByRole('button', { name, exact: true }).click()
}
const choose = async tone => {
  await openTab('나')
  await page.getByRole('button', { name: names[tone], exact: true }).click()
  await waitReady(tone)
  await openTab('정원')
  await page.waitForTimeout(120)
}
const check = message => { report.checks.push(message); console.log(`PASS ${message}`) }
const sameCamera = (a, b) => {
  // Pointer inertia may continue by less than a pixel after returning from Me.
  for (const field of ['position', 'target']) a[field].forEach((value, i) => assert.ok(Math.abs(value - b[field][i]) < 0.01, `${field} preserved`))
}
const identity = s => s.plantStates.map(({ id, position, bornAt, opened, lod }) => ({ id, position, bornAt, opened, lod })).sort((a, b) => a.id.localeCompare(b.id))
const capture = async name => page.locator('.home').first().screenshot({ path: `${directory}/${name}.png`, animations: 'disabled' })

try {
  await page.goto(`${base}/?view=home&friends=3&many=12&diagnostics=1`)
  await waitReady('balanced')
  report.browserVersion = browser.version()
  report.webglRenderer = await page.locator('.island canvas').evaluate(canvas => {
    const gl = canvas.getContext('webgl2')
    const debug = gl.getExtension('WEBGL_debug_renderer_info')
    return debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
  })
  await page.waitForFunction(() => window.__gardenDiagnostics.current.snapshot().opened === 14)
  assert.equal(await page.locator('.home').first().getAttribute('data-garden-theme'), 'balanced')
  check('Fresh actual Garden defaults to Balanced Warm')
  const initial = await snapshot()
  const bounds = await page.locator('.island canvas').boundingBox()
  await page.mouse.move(bounds.x + bounds.width * .5, bounds.y + bounds.height * .55)
  await page.mouse.down()
  await page.mouse.move(bounds.x + bounds.width * .68, bounds.y + bounds.height * .59, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(2200)
  const orbited = await snapshot()
  report.orbitBeforeSwitch = orbited.camera
  assert.notDeepEqual(orbited.camera.position, initial.camera.position)
  await choose('warm')
  report.orbitAfterSwitch = (await snapshot()).camera
  sameCamera((await snapshot()).camera, orbited.camera)
  check('Real pointer orbit and camera position survive Me navigation and a theme switch')
  await page.evaluate(camera => { window.__gardenDiagnostics.current.setCamera(camera); window.__gardenDiagnostics.current.freeze(6) }, initial.camera)
  await page.waitForTimeout(500)
  const reference = await snapshot()
  const layoutFields = ['modelUUID', 'grassMeshUUID', 'grassGeometryUUID', 'grassInstanceBufferId', 'grassMatrixVersion']
  const paints = {}
  await page.evaluate(() => { window.__gardenCanvas = document.querySelector('.island canvas') })
  for (const tone of themes) {
    await choose(tone)
    const current = await snapshot()
    assert.equal(current.islandGeometry.grassTheme, tone)
    assert.equal(current.islandGeometry.grassDrawCalls, 1)
    assert.equal(current.islandGeometry.grassClumps, 1000)
    assert.equal(current.islandGeometry.grassTriangles, 6000)
    assert.equal(current.islandGeometry.assetTriangles, 14099)
    for (const field of layoutFields) assert.equal(current.islandGeometry[field], reference.islandGeometry[field], field)
    paints[tone] = await paint()
    sameCamera(current.camera, reference.camera)
    assert.deepEqual(identity(current), identity(reference), 'Sound identities, positions, growth and LOD survive theme changes')
    assert.ok(current.plantStates.some(f => f.tree) && current.plantStates.some(f => f.blender) && current.plantStates.some(f => f.kind === 'pair'))
    assert.equal(await page.evaluate(() => window.__gardenCanvas === document.querySelector('.island canvas')), true)
    assert.equal(await page.evaluate(k => localStorage.getItem(k), key), tone)
    await capture(`${tone}-garden`)
    await page.evaluate(() => window.__gardenDiagnostics.current.resetPerformance())
    await page.waitForTimeout(3300)
    report.samples[`${tone}-14`] = await snapshot()
  }
  check('All four themes render trees, procedural flowers, Blender peonies and pairs at identical camera/time; same canvas and plant state')
  assert.equal(new Set(Object.values(paints).map(value => JSON.stringify(value))).size, 3)
  check('All four palettes share one 14,099-triangle island and the same 6,000-triangle grass layout and buffers')
  await openTab('나')
  await capture('theme-selector-desktop')
  await openTab('정원')

  // Near/far uses the source projected-width thresholds and remains stable across switching.
  await page.evaluate(() => window.__gardenDiagnostics.current.setCamera({ position: [0, 15, 36], target: [0, .1, 0] }))
  await page.waitForTimeout(600)
  assert.ok((await snapshot()).far > 0)
  await choose('balanced')
  assert.ok((await snapshot()).far > 0)
  await page.evaluate(() => window.__gardenDiagnostics.current.setCamera({ position: [0, 3, 8], target: [0, .1, 0] }))
  await page.waitForTimeout(600)
  assert.ok((await snapshot()).near > 0)
  check('Blender far and near LOD work before and after a theme switch')
  await page.evaluate(camera => window.__gardenDiagnostics.current.setCamera(camera), reference.camera)

  // Repeated switches must converge to the same resource counts, not accumulate them.
  report.resourceCycles = []
  for (let cycle = 0; cycle < 3; cycle++) {
    const counts = {}
    for (const tone of themes) {
      await choose(tone)
      await page.waitForTimeout(120)
      const s = await snapshot()
      assert.deepEqual(await paint(), paints[tone], `${tone} restores the same vertex colors`)
      for (const field of layoutFields) assert.equal(s.islandGeometry[field], reference.islandGeometry[field], field)
      counts[tone] = { geometries: s.geometries, textures: s.textures, programs: s.programs }
    }
    report.resourceCycles.push(counts)
  }
  assert.deepEqual(report.resourceCycles[2], report.resourceCycles[1])
  assert.equal(modelRequests.length, 1)
  assert.match(modelRequests[0], /\/models\/island-modern\.glb$/)
  check('Twelve switches restore exact vertex paint and stable GPU resource counts after one canonical GLB request')

  await choose('balanced')
  await page.waitForTimeout(200)
  const selectable = (await snapshot()).plantStates.find(f => f.blender)
  const canvasRect = await page.locator('.island canvas').boundingBox()
  await page.mouse.click(canvasRect.x + selectable.screen.x, canvasRect.y + selectable.screen.y)
  await page.locator('.sheet .bloom3d[data-flora="blender"]').waitFor()
  await page.locator('.sheet').screenshot({ path: `${directory}/balanced-blender-detail.png` })
  await page.getByRole('button', { name: '닫기', exact: true }).click()
  check('Real canvas raycast opens the selected Blender flower detail')

  // Compare all three directions at the same pose, viewport, fixtures and time.
  const { position, target } = reference.camera
  const [x, y, z] = position.map((value, i) => value - target[i])
  for (const [view, offset] of [['rear', [-x, y, -z]], ['side', [z, y, -x]]]) {
    const pose = { position: offset.map((value, i) => value + target[i]), target }
    await page.evaluate(pose => window.__gardenDiagnostics.current.setCamera(pose), pose)
    for (const tone of themes) {
      await choose(tone)
      const state = await snapshot()
      sameCamera(state.camera, pose)
      assert.equal(state.islandGeometry.modelUUID, reference.islandGeometry.modelUUID)
      assert.equal(state.islandGeometry.assetTriangles + state.islandGeometry.grassTriangles, 20099)
      report.samples[`${tone}-${view}`] = state
      await capture(`${tone}-${view}`)
    }
  }
  await page.evaluate(camera => window.__gardenDiagnostics.current.setCamera(camera), reference.camera)
  check('All four themes captured from identical front, rear and side poses')

  // The received-sound workflow exercises fresh plant growth in the actual Garden.
  await page.evaluate(() => window.__gardenDiagnostics.current.freeze(undefined))
  await openTab(/^받은 소리함/)
  await page.getByRole('button', { name: '심기', exact: true }).first().click()
  await page.getByRole('button', { name: '메뉴', exact: true }).click()
  await page.waitForFunction(() => window.__gardenDiagnostics.current.snapshot().plantStates.filter(f => f.kind === 'flower').length === 13)
  const planted = await snapshot()
  const fresh = planted.plantStates.find(f => f.kind === 'flower' && !reference.plantStates.some(old => old.id === f.id))
  assert.ok(fresh)
  await choose('aurora')
  const switched = (await snapshot()).plantStates.find(f => f.id === fresh.id)
  assert.equal(switched.bornAt, fresh.bornAt)
  await page.waitForFunction(id => window.__gardenDiagnostics.current.snapshot().plantStates.find(f => f.id === id)?.opened, fresh.id)
  check('Planting from the inbox and growth completion survive a theme switch without resetting birth time')

  await page.goto(`${base}/?view=home&friends=3&many=50&diagnostics=1`)
  await waitReady()
  await page.waitForFunction(() => window.__gardenDiagnostics.current.snapshot().opened === 52)
  await page.evaluate(() => window.__gardenDiagnostics.current.freeze(8))
  const denseLayout = (await snapshot()).islandGeometry
  for (const tone of themes) {
    await choose(tone)
    await page.evaluate(() => window.__gardenDiagnostics.current.resetPerformance())
    await page.waitForTimeout(3300)
    const current = await snapshot()
    assert.equal(current.plants, 52)
    for (const field of layoutFields) assert.equal(current.islandGeometry[field], denseLayout[field], field)
    report.samples[`${tone}-52`] = current
    await capture(`${tone}-dense50`)
  }
  check('Dense actual Garden with 50 received plants plus two pair flowers works in all four themes')

  await page.setViewportSize({ width: 390, height: 844 })
  for (const tone of themes) {
    await choose(tone)
    await page.waitForTimeout(200)
    await capture(`${tone}-mobile50`)
  }
  await openTab('나')
  await capture('theme-selector-mobile')
  assert.equal(await page.getByRole('button', { name: 'Original Opal', exact: true }).getAttribute('aria-pressed'), 'true')
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  check('Mobile selector has an explicit selected state and no horizontal overflow')

  const blocked = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await blocked.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new Error('storage disabled for test') } }))
  const blockedPage = await blocked.newPage()
  await blockedPage.goto(`${base}/?view=home&flowers=0`)
  await blockedPage.locator('.home[data-garden-theme="balanced"]').waitFor()
  await blockedPage.getByRole('button', { name: '메뉴', exact: true }).click()
  await blockedPage.locator('.menu-nav').getByRole('button', { name: '나', exact: true }).click()
  await blockedPage.getByRole('button', { name: 'Warm Opal', exact: true }).click()
  await blockedPage.locator('.home[data-garden-theme="warm"]').waitFor()
  assert.match(await blockedPage.locator('.garden-theme-note').first().textContent(), /저장할 수 없어요/)
  await blocked.close()
  check('Blocked storage keeps the app functional and makes the in-memory preference explicit')
  assert.deepEqual(report.errors, [])
  report.modelRequests = modelRequests
  assert.ok(modelRequests.every(url => /\/models\/island-modern\.glb$/.test(url)))
  report.passed = true
} catch (error) {
  report.passed = false
  report.failure = error.stack
  await page.screenshot({ path: `${directory}/browser-failure.png` }).catch(() => {})
  console.error(error)
  process.exitCode = 1
} finally {
  await writeFile(`${directory}/browser-results.json`, JSON.stringify(report, null, 2))
  await browser.close()
}
