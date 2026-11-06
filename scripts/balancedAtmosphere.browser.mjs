import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const mode = process.argv[2]
assert.ok(['before', 'after'].includes(mode), 'Usage: node scripts/balancedAtmosphere.browser.mjs before|after')
const base = process.env.GARDEN_TEST_URL || 'http://127.0.0.1:5199'
const art = 'art/balanced-atmosphere'
const scratch = '.qa-browser/balanced-atmosphere'
const themes = { balanced: 'Balanced Warm', warm: 'Warm Opal', aurora: 'Aurora Crystal', default: 'Original Opal' }
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const report = { browser: browser.version(), mode, checks: [], errors: [], scenes: {}, pixelDifferences: {} }
const pass = name => { report.checks.push(name); console.log(`PASS ${name}`) }
const snapshot = page => page.evaluate(() => window.__gardenDiagnostics.current.snapshot())
const plantIdentity = state => state.plantStates.map(({ id, position, bornAt, opened, lod }) => [id, position, bornAt, opened, lod]).sort(([a], [b]) => a.localeCompare(b))
async function pixelDifference(page, before, after) {
  if (before.equals(after)) return { pixels: 0, maxChannelDelta: 0 }
  return page.evaluate(async images => {
    const buffers = await Promise.all(images.map(async data => {
      const bitmap = await createImageBitmap(await fetch(data).then(response => response.blob()))
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      const context = canvas.getContext('2d')
      context.drawImage(bitmap, 0, 0)
      bitmap.close()
      return context.getImageData(0, 0, canvas.width, canvas.height).data
    }))
    const [a, b] = buffers
    if (a.length !== b.length) throw new Error('Screenshot dimensions differ')
    let pixels = 0, maxChannelDelta = 0
    for (let i = 0; i < a.length; i += 4) {
      const delta = Math.max(...[0, 1, 2, 3].map(c => Math.abs(a[i + c] - b[i + c])))
      if (delta > 0) pixels++
      maxChannelDelta = Math.max(maxChannelDelta, delta)
    }
    return { pixels, maxChannelDelta }
  }, [before, after].map(image => `data:image/png;base64,${image.toString('base64')}`))
}
const ready = (page, tone) => page.waitForFunction(tone => {
  const state = window.__gardenDiagnostics?.current?.snapshot()
  return state?.tone === tone && state.island === 'loaded' && state.plants > 0 && state.opened === state.plants
}, tone, { timeout: 60000 })

async function tab(page, name) {
  await page.getByRole('button', { name: '메뉴', exact: true }).click()
  await page.locator('.menu-nav').getByRole('button', { name, exact: true }).click()
}

async function choose(page, tone) {
  await tab(page, '나')
  await page.getByRole('button', { name: themes[tone], exact: true }).click()
  await ready(page, tone)
  await tab(page, '정원')
  await page.waitForTimeout(120)
}

async function capture(tone, dense = false) {
  const viewport = dense ? { width: 390, height: 844 } : { width: 1280, height: 900 }
  const context = await browser.newContext({ viewport, timezoneId: 'Asia/Seoul', deviceScaleFactor: 1 })
  await context.addInitScript(({ tone, time }) => {
    const OriginalDate = Date
    globalThis.Date = class extends OriginalDate {
      constructor(...args) { super(...(args.length ? args : [time])) }
      static now() { return time }
    }
    if (tone !== 'balanced') localStorage.setItem('sup.garden-theme.v1.demo', tone)
    // Freeze the actual renderer before its first scheduled frame, including its legacy dots.
    const raf = window.requestAnimationFrame.bind(window)
    let frozen = false
    window.requestAnimationFrame = callback => raf(now => {
      const api = window.__gardenDiagnostics?.current
      if (api && !frozen) { api.freeze(6); frozen = true }
      callback(now)
    })
  }, { tone, time: Date.parse('2026-01-15T03:00:00Z') })
  await context.route('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css', route => route.fulfill({ contentType: 'text/css', body: '/* Offline font fallback. */' }))
  const page = await context.newPage()
  page.on('pageerror', e => report.errors.push(e.message))
  page.on('console', e => { if (e.type() === 'error') report.errors.push(e.text()) })
  await page.goto(`${base}/?view=home&friends=3&many=${dense ? 50 : 12}&diagnostics=1`)
  await ready(page, tone)
  await page.waitForFunction(() => window.__gardenDiagnostics.current.snapshot().performance.frame.samples === 180)
  const label = dense ? 'balanced-mobile-dense' : tone
  const folder = tone === 'balanced' ? art : scratch
  const image = await page.locator('.home').screenshot({ path: `${folder}/${label}-${mode}.png`, animations: 'disabled' })
  const state = await snapshot(page)
  assert.equal(state.plants, dense ? 52 : 14)
  report.scenes[label] = state
  pass(`${label}: ${state.calls} draws, ${state.triangles} triangles, ${state.performance.frame.meanMs} ms mean frame interval`)
  if (mode === 'after') assert.equal(state.balancedMotes?.count ?? 0, tone === 'balanced' ? 72 : 0)
  if (mode === 'after' && tone !== 'balanced') {
    const difference = await pixelDifference(page, await readFile(`${folder}/${label}-before.png`), image)
    // Allow only isolated one-level GPU rounding differences in an 8-bit channel.
    assert.ok(difference.pixels <= 10 && difference.maxChannelDelta <= 1, `${tone} screenshot differs: ${JSON.stringify(difference)}`)
    report.pixelDifferences[tone] = difference
    pass(`${tone}: visually matches baseline (${difference.pixels} pixels differ by at most ${difference.maxChannelDelta}/255)`)
  }
  if (mode === 'after' && tone === 'balanced' && !dense) await exerciseBalanced(page, state)
  await context.close()
}

async function exerciseBalanced(page, initial) {
  const canvas = page.locator('.island canvas')
  const rect = await canvas.boundingBox()
  const peony = initial.plantStates.find(plant => plant.blender)
  await page.evaluate(() => window.__gardenDiagnostics.current.freeze(undefined))
  const first = (await snapshot(page)).balancedMotes.time
  await page.waitForFunction(first => window.__gardenDiagnostics.current.snapshot().balancedMotes.time > first + 0.5, first)
  await page.mouse.click(rect.x + peony.screen.x, rect.y + peony.screen.y)
  await page.locator('.sheet .bloom3d[data-flora="blender"]').waitFor()
  await page.getByRole('button', { name: '닫기', exact: true }).click()
  pass('A real canvas click opens the Blender flower while particles are moving')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForFunction(() => window.__gardenDiagnostics.current.snapshot().balancedMotes.time === 6)
  await page.waitForTimeout(200)
  assert.equal((await snapshot(page)).balancedMotes.time, 6)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  pass('Reduced-motion preference holds the dust still')
  await page.evaluate(() => window.__gardenDiagnostics.current.freeze(6))
  await canvas.evaluate(node => { node.dataset.atmosphereTest = 'original' })
  const resources = []
  for (let cycle = 0; cycle < 3; cycle++) {
    const counts = {}
    for (const tone of ['warm', 'aurora', 'default', 'balanced']) {
      await choose(page, tone)
      const state = await snapshot(page)
      assert.deepEqual(state.camera, initial.camera)
      assert.equal(state.islandGeometry.grassTheme, tone)
      assert.equal(state.balancedMotes?.buffer ?? null, tone === 'balanced' ? initial.balancedMotes.buffer : null)
      assert.deepEqual(plantIdentity(state), plantIdentity(initial))
      assert.equal(await canvas.getAttribute('data-atmosphere-test'), 'original')
      counts[tone] = [state.geometries, state.textures, state.programs]
    }
    resources.push(counts)
  }
  assert.deepEqual(resources[2], resources[1], 'Resource counts settle after initial allocation')
  report.resourceCycles = resources
  pass('Twelve switches retain the canvas, camera, plants, LOD, grass, and stable resource counts')
}

try {
  await mkdir(art, { recursive: true })
  await mkdir(scratch, { recursive: true })
  for (const tone of Object.keys(themes)) await capture(tone)
  await capture('balanced', true)
  assert.deepEqual(report.errors, [])
  if (mode === 'after') {
    const previous = JSON.parse(await readFile(`${scratch}/before.json`, 'utf8'))
    for (const [label, state] of Object.entries(report.scenes)) {
      assert.deepEqual(state.camera, previous.scenes[label].camera)
      assert.equal(state.triangles, previous.scenes[label].triangles)
      assert.equal(state.calls, previous.scenes[label].calls)
    }
    pass('All five matched views retain the same camera, triangle and draw counts')
  }
  report.passed = true
} finally {
  await writeFile(`${scratch}/${mode}.json`, JSON.stringify(report, null, 2))
  await browser.close()
}
