import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPreviewGpuTiming } from '../../src/lib/previewGpuTiming.js'
import { AuroraGlowPass } from '../../src/lib/AuroraGlowPass.js'

// Lifecycle and bounds tests without a GPU. Actual GPU measurements belong to browser QA.
const report = { status: 'passed', gpuTimer: [], glow: {} }
function mockGL({ extension = true, failQuery = -1, available = false } = {}) {
  const queries = [], deleted = [], reads = []
  const ext = { TIME_ELAPSED_EXT: 1, GPU_DISJOINT_EXT: 2 }
  const state = { active: null, lost: false, disjoint: false, begins: 0, ends: 0 }
  const gl = {
    QUERY_RESULT_AVAILABLE: 3, QUERY_RESULT: 4, CURRENT_QUERY: 5,
    getExtension: () => extension ? ext : null,
    isContextLost: () => state.lost,
    createQuery() {
      if (queries.length === failQuery) return null
      const query = { id: queries.length, available, ns: 1e6 }
      queries.push(query)
      return query
    },
    deleteQuery(query) { deleted.push(query) },
    getParameter(key) { assert.equal(key, ext.GPU_DISJOINT_EXT); return state.disjoint },
    getQuery(target, key) { assert.equal(target, ext.TIME_ELAPSED_EXT); assert.equal(key, gl.CURRENT_QUERY); return state.active },
    beginQuery(target, query) { assert.equal(target, ext.TIME_ELAPSED_EXT); assert.equal(state.active, null); state.active = query; state.begins++ },
    endQuery(target) { assert.equal(target, ext.TIME_ELAPSED_EXT); assert.ok(state.active); state.active = null; state.ends++ },
    getQueryParameter(query, key) {
      if (key === gl.QUERY_RESULT_AVAILABLE) return query.available
      assert.equal(key, gl.QUERY_RESULT)
      assert.equal(query.available, true, 'Never read an unavailable GPU query')
      reads.push(query.id)
      return query.ns
    },
  }
  return { gl, queries, deleted, reads, state, timer: createPreviewGpuTiming({ getContext: () => gl }) }
}

{
  const mock = mockGL({ extension: false })
  mock.timer.begin(); mock.timer.end(); mock.timer.dispose()
  assert.deepEqual(mock.timer.sample(), { available: false, samples: 0, meanMs: 0, p95Ms: 0 })
  assert.equal(mock.queries.length, 0)
  report.gpuTimer.push('Unsupported extension is a no-op')
}
{
  const mock = mockGL({ failQuery: 2 })
  assert.equal(mock.deleted.length, 2)
  assert.equal(mock.timer.sample().available, false)
  report.gpuTimer.push('Partial query allocation cleans up already-created handles')
}
{
  const mock = mockGL()
  for (let i = 0; i < 8; i++) { mock.timer.begin(); mock.timer.end() }
  assert.equal(mock.state.begins, 4)
  assert.equal(mock.queries.length, 4)
  assert.equal(mock.reads.length, 0)
  assert.equal(mock.timer.sample().samples, 0)
  mock.queries.forEach((query, i) => { query.available = true; query.ns = (i + 1) * 1e6 })
  assert.deepEqual(mock.timer.sample(), { available: true, samples: 4, meanMs: 2.5, p95Ms: 4 })
  mock.timer.dispose(); mock.timer.dispose()
  assert.equal(mock.deleted.length, 4)
  report.gpuTimer.push('Four-query pool bounds pending work and waits for availability without blocking')
  report.gpuTimer.push('Nanoseconds convert to milliseconds; mean and p95 are correct; disposal is idempotent')
}
{
  const mock = mockGL({ available: true })
  mock.timer.begin(); mock.timer.end()
  assert.equal(mock.timer.sample().samples, 1)
  mock.state.disjoint = true
  mock.timer.begin()
  assert.equal(mock.state.begins, 1)
  assert.equal(mock.timer.sample().samples, 0)
  mock.state.disjoint = false
  mock.timer.begin(); mock.timer.end()
  assert.equal(mock.timer.sample().samples, 1)
  mock.timer.dispose()
  report.gpuTimer.push('GPU disjoint invalidates old samples and resumes cleanly')
}
{
  const mock = mockGL({ available: true })
  mock.state.active = { external: true }
  mock.timer.begin(); mock.timer.end()
  assert.equal(mock.state.begins, 0)
  assert.equal(mock.state.ends, 0)
  mock.state.active = null
  mock.timer.begin(); mock.timer.begin()
  assert.equal(mock.state.begins, 1)
  mock.timer.dispose()
  assert.equal(mock.state.ends, 1)
  assert.equal(mock.deleted.length, 4)
  report.gpuTimer.push('Existing profiler query is untouched; nested begin and active cleanup are safe')
}
{
  const mock = mockGL()
  mock.timer.begin()
  mock.state.lost = true
  mock.timer.end()
  assert.equal(mock.state.ends, 0)
  assert.equal(mock.timer.sample().available, false)
  assert.equal(mock.deleted.length, 4)
  report.gpuTimer.push('Context loss disables measurement and releases handles without ending a lost-context query')
}
{
  const mock = mockGL({ available: true })
  for (let i = 0; i < 210; i++) {
    mock.queries.forEach(query => { query.ns = (i + 1) * 1e6 })
    mock.timer.begin(); mock.timer.end(); mock.timer.sample()
  }
  const result = mock.timer.sample()
  assert.deepEqual(result, { available: true, samples: 180, meanMs: 120.5, p95Ms: 201 })
  mock.timer.dispose()
  report.gpuTimer.push('Timing storage stays bounded at the latest 180 samples')
}

{
  const pass = new AuroraGlowPass()
  const sizes = []
  for (const [width, height] of [[2469, 1042], [390, 624], [7680, 4320], [1, 1]]) {
    pass.setSize(width, height)
    assert.ok(pass.bright.width >= 1 && pass.bright.height >= 1)
    assert.ok(Math.max(pass.bright.width, pass.bright.height) <= 384)
    assert.equal(pass.bright.width, pass.blur.width)
    assert.equal(pass.bright.height, pass.blur.height)
    sizes.push({ input: [width, height], target: [pass.bright.width, pass.bright.height] })
  }
  const targets = [], draws = []
  const renderer = { autoClear: true, setRenderTarget(target) { targets.push(target) }, render() { draws.push(true) } }
  const read = { texture: {} }, write = { texture: {} }
  pass.render(renderer, write, read)
  assert.equal(draws.length, 4)
  assert.deepEqual(targets, [pass.bright, pass.blur, pass.bright, write])
  assert.equal(renderer.autoClear, true)
  assert.equal(pass.extractMaterial.uniforms.tScene.value, read.texture)
  assert.equal(pass.combineMaterial.uniforms.tScene.value, read.texture)
  assert.equal(pass.combineMaterial.uniforms.tGlow.value, pass.bright.texture)
  pass.renderToScreen = true
  pass.render(renderer, write, read)
  assert.equal(targets.at(-1), null)
  const failureRenderer = { autoClear: true, setRenderTarget() {}, render() { throw new Error('test draw failure') } }
  assert.throws(() => pass.render(failureRenderer, write, read), /test draw failure/)
  assert.equal(failureRenderer.autoClear, true)
  let disposals = 0
  for (const resource of [pass.bright, pass.blur, pass.extractMaterial, pass.blurMaterial, pass.combineMaterial]) {
    resource.addEventListener('dispose', () => disposals++)
  }
  pass.dispose()
  assert.equal(disposals, 5)
  report.glow = { draws: 4, targets: 2, maxTargetDimension: 384, sizingCases: sizes,
    noExtraSceneRender: true, rendererAutoClearRestoredOnError: true, resourcesDisposed: true }
}

await writeFile(join(dirname(fileURLToPath(import.meta.url)), 'preview-performance-validation.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
