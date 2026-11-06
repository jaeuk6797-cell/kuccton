import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const viewport = { width: 1280, height: 900 }
const cases = []
const errors = []
const getStats = () => JSON.parse(document.querySelector('[data-stats]')?.dataset.stats || 'null')
try {
  for (const tone of ['balanced', 'aurora', 'warm', 'default']) {
    const pair = { tone }
    for (const kind of ['integration', 'source']) {
      const port = kind === 'integration' ? 5199 : tone === 'aurora' ? 5206 : 5205
      const page = await browser.newPage({ viewport, deviceScaleFactor: 1 })
      page.on('pageerror', error => errors.push({ tone, kind, error: error.message }))
      page.on('console', message => { if (message.type() === 'error') errors.push({ tone, kind, error: message.text() }) })
      await page.goto(`http://127.0.0.1:${port}/?view=island&tone=${tone}&flora=mixed&plants=50&still=1`)
      await page.waitForFunction(() => {
        const stats = JSON.parse(document.querySelector('[data-stats]')?.dataset.stats || 'null')
        return stats?.island === 'loaded' && stats.plants === 50 && stats.near + stats.far > 0
      }, null, { timeout: 60000 })
      if (kind === 'source') {
        await page.evaluate(camera => {
          const s = window.__baselineScene
          s.camera.fov = 36
          s.controls.target.fromArray(camera.target)
          // Prime near LOD before returning to the comparison pose. Otherwise the
          // older source's wider initial camera leaves peonies on the far side of
          // the preserved hysteresis band despite identical final projection.
          s.camera.position.fromArray(camera.position).sub(s.controls.target).multiplyScalar(.4).add(s.controls.target)
          s.controls.update()
          s.camera.updateProjectionMatrix()
        }, pair.integration.camera)
        await page.waitForTimeout(800)
        await page.evaluate(camera => {
          const s = window.__baselineScene
          s.camera.position.fromArray(camera.position)
          s.controls.target.fromArray(camera.target)
          s.controls.update()
        }, pair.integration.camera)
      }
      await page.waitForFunction(() => {
        const stats = JSON.parse(document.querySelector('[data-stats]')?.dataset.stats || 'null')
        return stats?.performance?.frame?.samples === 180
      }, null, { timeout: 60000 })
      await page.waitForTimeout(3500)
      pair[kind] = await page.evaluate(getStats)
      pair[kind].webglRenderer = await page.evaluate(() => {
        const canvas = document.querySelector('.island canvas')
        const gl = canvas.getContext('webgl2')
        const ext = gl.getExtension('WEBGL_debug_renderer_info')
        return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
      })
      await page.close()
      console.log(`${tone} ${kind}: ${pair[kind].calls} calls, ${pair[kind].triangles} triangles, CPU ${pair[kind].performance.renderCPU.meanMs} ms`)
    }
    pair.delta = {
      calls: pair.integration.calls - pair.source.calls,
      triangles: pair.integration.triangles - pair.source.triangles,
      renderCpuMeanMs: Number((pair.integration.performance.renderCPU.meanMs - pair.source.performance.renderCPU.meanMs).toFixed(2)),
      frameMeanMs: Number((pair.integration.performance.frame.meanMs - pair.source.performance.frame.meanMs).toFixed(2)),
    }
    if (pair.source.near !== pair.integration.near || pair.source.far !== pair.integration.far) {
      throw new Error(`${tone}: mismatched LOD state invalidates the comparison`)
    }
    cases.push(pair)
    await mkdir('art/garden-themes', { recursive: true })
    await writeFile('art/garden-themes/baseline-performance.json', JSON.stringify({
      measuredAt: new Date().toISOString(),
      methodology: 'Serial headless Chrome, 1280x900, DPR 1, mixed 50-plant preview, fixed t=6, exact same camera/target and 36-degree FOV, 180-sample rolling windows after warm-up. Source visual modules/assets extracted from bbc538b and 2af54a7. Current-main flower.js/soundFeatures.js/naming.js/tree.js used by both sides to generate identical stored sound fixtures; no visual settings changed except camera alignment. Source test handle only exposes camera. Wall-clock timings can vary under concurrent system load; draw and triangle differences are deterministic.',
      sources: { balanced: 'bbc538b', warm: '536d2ac (identical warm path in bbc538b)', default: '536d2ac (identical default path in bbc538b)', aurora: '2af54a7' },
      cases, errors,
    }, null, 2))
  }
} finally { await browser.close() }
