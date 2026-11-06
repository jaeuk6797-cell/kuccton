import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

// Isolated, reproducible material-only verification. No application file mutation.
const mode = process.argv[2]
assert.ok(['before', 'draft', 'after'].includes(mode), 'Usage: node scripts/balancedGround.browser.mjs before|draft|after')
const base = process.env.GARDEN_TEST_URL || `http://127.0.0.1:${mode === 'before' ? 5318 : 5317}`
assert.ok(['5317', '5318'].includes(new URL(base).port), 'Use the isolated Balanced QA ports')
const art = 'art/balanced-green-ground'
const themes = { balanced: 'Balanced Warm', warm: 'Warm Opal', aurora: 'Aurora Crystal', default: 'Original Opal' }
const report = { started: new Date().toISOString(), mode, base, baseline: 'd5b12a3', fixedDate: '2026-01-15T03:00:00Z', fixedAnimationSeconds: 6, checks: [], errors: [], scenes: {}, pixelDifferences: {}, sourceHashes: {}, limitations: ['Headless Chrome on this desktop; portrait viewport is not a physical mobile-device measurement.', 'Offline font fallback and local HomeDemo fixtures; no live account or audio storage was used.'] }
const browser = await chromium.launch({ channel: 'chrome', headless: true })
report.browser = browser.version()
const pass = name => { report.checks.push(name); console.log(`PASS ${name}`) }
const snapshot = page => page.evaluate(() => window.__gardenDiagnostics.current.snapshot())
const inspect = async page => JSON.parse(await page.evaluate(() => JSON.stringify(window.__balancedGroundInspect())))
const identity = state => state.plantStates.map(({ id, position, bornAt, opened, lod }) => ({ id, position, bornAt, opened, lod })).sort((a, b) => a.id.localeCompare(b.id))
const crossLoadIdentity = state => identity(state).map(({ bornAt, ...plant }) => plant)
const layoutFields = ['modelUUID', 'grassMeshUUID', 'grassGeometryUUID', 'grassInstanceBufferId', 'grassMatrixVersion']

// The served component is instrumented read-only, solely to inspect active material values.
const inspection = `window.__balancedGroundInspect = () => {
  const hash = array => {
    if (!array) return null;
    const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    let h = 2166136261;
    for (const b of bytes) h = Math.imul(h ^ b, 16777619);
    return { bytes: bytes.length, fnv1a: h >>> 0 };
  };
  const meshes = [];
  islandModel?.traverse(mesh => {
    if (!mesh.isMesh || mesh === grass?.mesh) return;
    const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(m => ({
      name: m.name, type: m.type, color: m.color?.toArray(), emissive: m.emissive?.toArray(), emissiveIntensity: m.emissiveIntensity,
      roughness: m.roughness, metalness: m.metalness, clearcoat: m.clearcoat, clearcoatRoughness: m.clearcoatRoughness,
      iridescence: m.iridescence, transmission: m.transmission, opacity: m.opacity, transparent: m.transparent,
      envMapIntensity: m.envMapIntensity, normalScale: m.normalScale?.toArray(), specularColor: m.specularColor?.toArray(),
      specularIntensity: m.specularIntensity, alphaTest: m.alphaTest, side: m.side,
      shader: m.onBeforeCompile?.toString(), cacheKey: m.customProgramCacheKey?.(),
    }));
    meshes.push({ name: mesh.name, materials, color: hash(mesh.geometry.attributes.color?.array),
      position: hash(mesh.geometry.attributes.position?.array), normal: hash(mesh.geometry.attributes.normal?.array),
      index: hash(mesh.geometry.index?.array), castShadow: mesh.castShadow, receiveShadow: mesh.receiveShadow });
  });
  return meshes.sort((a,b) => a.name.localeCompare(b.name));
};\n`;

async function pixelDifference(page, a, b) {
  if (a.equals(b)) return { pixels: 0, maxChannelDelta: 0 }
  return page.evaluate(async images => {
    const pixels = await Promise.all(images.map(async data => {
      const bitmap = await createImageBitmap(await fetch(data).then(r => r.blob()))
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), context = canvas.getContext('2d')
      context.drawImage(bitmap, 0, 0); bitmap.close()
      return context.getImageData(0, 0, canvas.width, canvas.height).data
    }))
    if (pixels[0].length !== pixels[1].length) throw new Error('Different image dimensions')
    let changed = 0, max = 0
    for (let i = 0; i < pixels[0].length; i += 4) {
      let delta = 0
      for (let c = 0; c < 4; c++) delta = Math.max(delta, Math.abs(pixels[0][i + c] - pixels[1][i + c]))
      if (delta) changed++
      max = Math.max(max, delta)
    }
    return { pixels: changed, maxChannelDelta: max }
  }, [a, b].map(image => `data:image/png;base64,${image.toString('base64')}`))
}

const ready = (page, tone) => page.waitForFunction(tone => {
  const s = window.__gardenDiagnostics?.current?.snapshot()
  return s?.tone === tone && s.island === 'loaded' && s.opened === s.plants
}, tone, { timeout: 60000 })
async function tab(page, name) {
  await page.getByRole('button', { name: '메뉴', exact: true }).click()
  await page.locator('.menu-nav').getByRole('button', { name, exact: typeof name === 'string' }).click()
}
async function choose(page, tone) {
  await tab(page, '나')
  await page.getByRole('button', { name: themes[tone], exact: true }).click()
  // The hidden garden intentionally pauses growth while Me is open.
  await page.waitForFunction(tone => {
    const state = window.__gardenDiagnostics?.current?.snapshot()
    return state?.tone === tone && state.island === 'loaded'
  }, tone)
  await tab(page, '정원')
  await page.waitForTimeout(120)
}

async function newScene(tone, { dense = false, mobile = false, empty = false } = {}) {
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, timezoneId: 'Asia/Seoul', deviceScaleFactor: 1 })
  await context.addInitScript(({ tone, time }) => {
    const OriginalDate = Date
    globalThis.Date = class extends OriginalDate { constructor(...args) { super(...(args.length ? args : [time])) } static now() { return time } }
    localStorage.setItem('sup.garden-theme.v1.demo', tone)
    const raf = window.requestAnimationFrame.bind(window)
    let frozen = false
    window.requestAnimationFrame = callback => raf(now => {
      const api = window.__gardenDiagnostics?.current
      if (api && !frozen) { api.freeze(6); frozen = true }
      callback(now)
    })
  }, { tone, time: Date.parse(report.fixedDate) })
  await context.route('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css', route => route.fulfill({ contentType: 'text/css', body: '' }))
  await context.route('**/src/components/Island3D.jsx*', async route => {
    const response = await route.fetch()
    let body = await response.text()
    assert.ok(body.includes('const api = {'), 'Diagnostic injection anchor exists')
    body = body.replace('const api = {', `${inspection}const api = {`)
    await route.fulfill({ response, body })
  })
  const page = await context.newPage(), modelRequests = []
  page.on('pageerror', e => report.errors.push(e.message))
  page.on('console', e => { if (e.type() === 'error') report.errors.push(e.text()) })
  page.on('request', r => { if (/\/models\/island[^/]*\.glb$/.test(r.url())) modelRequests.push(r.url()) })
  await page.goto(`${base}/?view=home&friends=3&many=${dense ? 50 : 12}&diagnostics=1${empty ? '&flowers=0' : ''}`)
  await ready(page, tone)
  await page.waitForTimeout(500)
  if (!report.webglRenderer) report.webglRenderer = await page.locator('.island canvas').evaluate(canvas => {
    const gl = canvas.getContext('webgl2'), debug = gl.getExtension('WEBGL_debug_renderer_info')
    return debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
  })
  return { context, page, modelRequests }
}

async function saveScene(page, label, expectedPlants, sample = false) {
  if (sample) {
    await page.evaluate(() => window.__gardenDiagnostics.current.resetPerformance())
    await page.waitForFunction(() => window.__gardenDiagnostics.current.snapshot().performance.frame.samples >= 30)
  }
  const state = await snapshot(page), materials = await inspect(page)
  assert.equal(state.plants, expectedPlants)
  assert.equal(state.islandGeometry.assetTriangles, 14099)
  assert.equal(state.islandGeometry.grassTriangles, 6000)
  assert.equal(state.islandGeometry.grassClumps, 1000)
  assert.equal(state.islandGeometry.grassDrawCalls, 1)
  const path = `${art}/${mode}/${label}.png`
  const image = await page.locator('.home').screenshot({ path, animations: 'disabled' })
  report.scenes[label] = { ...state, materials, image: path }
  console.log(`CAPTURE ${label}: ${state.calls} calls, ${state.triangles} pass-expanded triangles`)
  if (mode === 'after') {
    const before = previous.scenes[label]
    assert.deepEqual(state.camera, before.camera, `${label} matched camera`)
    // Initial birth times are relative to each renderer's load clock, not wall time.
    // Exact birth-time preservation is asserted separately during same-app cycling.
    assert.deepEqual(crossLoadIdentity(state), crossLoadIdentity(before), `${label} matched plant identity/growth/LOD`)
    assert.equal(state.calls, before.calls, `${label} draw calls`)
    assert.equal(state.triangles, before.triangles, `${label} triangles`)
    const protectedMeshes = meshes => meshes.filter(m => !/^Island_Surface/.test(m.name))
    assert.deepEqual(protectedMeshes(materials), protectedMeshes(before.materials), `${label} protected meshes including pond and crystals`)
    if (['warm', 'aurora', 'default'].includes(label)) {
      assert.deepEqual(materials, before.materials, `${label} complete active materials and paint unchanged`)
      const difference = await pixelDifference(page, await readFile(before.image), image)
      report.pixelDifferences[label] = difference
      assert.ok(difference.pixels <= 10 && difference.maxChannelDelta <= 1, `${label} pixel difference ${JSON.stringify(difference)}`)
    }
  }
  return state
}

async function exercise(page, initial, modelRequests) {
  const canvas = page.locator('.island canvas'), references = {}, cycles = []
  await canvas.evaluate(node => { node.dataset.balancedQa = 'original' })
  for (let cycle = 0; cycle < 3; cycle++) {
    const resources = {}
    for (const tone of ['warm', 'aurora', 'default', 'balanced']) {
      await choose(page, tone)
      const state = await snapshot(page), paint = await inspect(page)
      assert.deepEqual(state.camera, initial.camera)
      assert.deepEqual(identity(state), identity(initial))
      for (const field of layoutFields) assert.equal(state.islandGeometry[field], initial.islandGeometry[field], field)
      assert.equal(await canvas.getAttribute('data-balanced-qa'), 'original')
      if (references[tone]) assert.deepEqual(paint, references[tone], `${tone} material/paint restoration`)
      else references[tone] = paint
      resources[tone] = { geometries: state.geometries, textures: state.textures, programs: state.programs }
    }
    cycles.push(resources)
  }
  assert.deepEqual(cycles[2], cycles[1])
  assert.equal(modelRequests.length, 1)
  report.resourceCycles = cycles
  pass('Twelve immediate theme switches preserve the same model/grass buffers, camera, positions, growth, LOD and exact theme material values; GPU counts settle')

  const rect = await canvas.boundingBox(), peony = initial.plantStates.find(p => p.blender)
  await page.mouse.click(rect.x + peony.screen.x, rect.y + peony.screen.y)
  await page.locator('.sheet .bloom3d[data-flora="blender"]').waitFor()
  await page.locator('.sheet').screenshot({ path: `${art}/after/balanced-selection.png` })
  await page.getByRole('button', { name: '닫기', exact: true }).click()
  pass('Desktop real canvas raycast opens and closes the Blender flower detail')
  await page.evaluate(() => window.__gardenDiagnostics.current.setCamera({ position: [0, 15, 36], target: [0, .1, 0] }))
  await page.waitForTimeout(350)
  assert.ok((await snapshot(page)).far > 0)
  await choose(page, 'warm')
  assert.ok((await snapshot(page)).far > 0)
  await page.evaluate(() => window.__gardenDiagnostics.current.setCamera({ position: [0, 3, 8], target: [0, .1, 0] }))
  await page.waitForTimeout(350)
  assert.ok((await snapshot(page)).near > 0)
  await choose(page, 'balanced')
  await page.evaluate(camera => window.__gardenDiagnostics.current.setCamera(camera), initial.camera)
  pass('Blender far/near LOD and camera survive theme changes')

  await page.evaluate(() => window.__gardenDiagnostics.current.freeze(undefined))
  await tab(page, /^받은 소리함/)
  await page.getByRole('button', { name: '심기', exact: true }).first().click()
  await page.getByRole('button', { name: '메뉴', exact: true }).click()
  // Planting recalculates derived pair flowers, so test received-flower count and ID.
  await page.waitForFunction(() => window.__gardenDiagnostics.current.snapshot().plantStates.filter(p => p.kind === 'flower').length === 13)
  const planted = await snapshot(page), fresh = planted.plantStates.find(p => p.kind === 'flower' && !initial.plantStates.some(old => old.id === p.id))
  assert.ok(fresh)
  await choose(page, 'aurora')
  const switched = (await snapshot(page)).plantStates.find(p => p.id === fresh.id)
  assert.equal(switched.bornAt, fresh.bornAt)
  await page.waitForFunction(id => window.__gardenDiagnostics.current.snapshot().plantStates.find(p => p.id === id)?.opened, fresh.id)
  report.growth = { id: fresh.id, bornAtBefore: fresh.bornAt, bornAtAfter: switched.bornAt, finalOpened: true }
  pass('Actual inbox planting completes growth across a theme switch without resetting its birth time')
}

let previous
try {
  await mkdir(`${art}/${mode}`, { recursive: true })
  for (const file of ['src/components/Island3D.jsx', 'src/lib/islandTone.js', 'src/lib/islandGrass.js', 'public/models/island-modern.glb']) {
    const response = await fetch(`${base}/${file}`)
    // Raw local files are hashed separately from Vite-transformed source below.
    report.sourceHashes[file] = createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex')
  }
  if (mode === 'after') previous = JSON.parse(await readFile(`${art}/before/results.json`, 'utf8'))
  for (const tone of mode === 'draft' ? ['balanced'] : Object.keys(themes)) {
    const { context, page, modelRequests } = await newScene(tone)
    const state = await saveScene(page, tone, 14, tone === 'balanced' && mode !== 'draft')
    if (mode === 'after' && tone === 'balanced') await exercise(page, state, modelRequests)
    await context.close()
  }
  {
    const { context, page } = await newScene('balanced', { empty: true })
    const state = await saveScene(page, 'balanced-empty', 0)
    const target = [0, .10, 0]
    const position = state.camera.position.map((n, i) => target[i] + (n - state.camera.target[i]) * .58)
    await page.evaluate(pose => window.__gardenDiagnostics.current.setCamera(pose), { position, target })
    await page.waitForTimeout(250)
    await saveScene(page, 'balanced-closeup', 0)
    await context.close()
  }
  if (mode !== 'draft') for (const mobile of [false, true]) {
    const { context, page } = await newScene('balanced', { dense: true, mobile })
    const state = await saveScene(page, mobile ? 'balanced-mobile50' : 'balanced-dense50', 52, !mobile)
    if (mode === 'after' && mobile) {
      const rect = await page.locator('.island canvas').boundingBox()
      const selectable = state.plantStates.find(p => p.blender && p.screen.x > 20 && p.screen.x < rect.width - 20 && p.screen.y > 30 && p.screen.y < rect.height - 30)
      assert.ok(selectable)
      await page.mouse.click(rect.x + selectable.screen.x, rect.y + selectable.screen.y)
      await page.locator('.sheet .bloom3d[data-flora="blender"]').waitFor()
      await page.locator('.sheet').screenshot({ path: `${art}/after/balanced-mobile-selection.png` })
      await page.getByRole('button', { name: '닫기', exact: true }).click()
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      pass('Dense 52-object portrait garden supports real Blender-flower selection and close without horizontal overflow')
    }
    await context.close()
  }
  assert.deepEqual(report.errors, [])
  if (mode === 'after') pass('All eight matched views preserve geometry/counts/camera/plant state; pond and crystal materials/paint are exact; three other themes are pixel-identical within one-level GPU tolerance')
  report.passed = true
} catch (error) {
  report.failure = error.stack
  console.error(error.stack)
} finally {
  report.finished = new Date().toISOString()
  await writeFile(`${art}/${mode}/results.json`, JSON.stringify(report, null, 2))
  await Promise.race([browser.close(), new Promise(resolve => setTimeout(resolve, 10000))])
  // Vite fetch keep-alive sockets otherwise outlive the closed browser on Windows.
  process.exit(report.passed ? 0 : 1)
}
