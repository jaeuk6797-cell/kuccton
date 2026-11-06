import assert from 'node:assert/strict'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = dirname(fileURLToPath(import.meta.url))
const captures = JSON.parse(await readFile(join(directory, 'browser-comparison.json'), 'utf8'))
const tolerance = 1e-6
const expectedViews = ['garden', 'peonies', 'rotated', 'dense50', 'portrait50',
  ...['joy', 'excited', 'flutter', 'cozy', 'calm', 'sad', 'tense', 'tree-round', 'tree-pine', 'tree-willow', 'pair'].map(name => `study-${name}`)]
assert.deepEqual(Object.keys(captures).sort(), expectedViews.flatMap(view => [`warm-${view}`, `balanced-${view}`]).sort(),
  'All 32 planned final captures are present, with no historical captures mixed in')
const comparableCounts = ['plants', 'near', 'far', 'calls', 'triangles', 'geometries', 'growing', 'opened']
const compareNumericObject = (before, after, label) => {
  assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort(), `${label}: same fields`)
  for (const key of Object.keys(before)) {
    const difference = Math.abs(after[key] - before[key])
    assert.ok(Number.isFinite(difference) && difference <= tolerance, `${label}: ${key} matches`)
  }
}
const timing = capture => {
  const performance = capture.performance
  assert.ok(performance?.frame && performance?.renderCPU, 'Frame/CPU timing metadata exists')
  const flags = []
  if (performance.frame.samples < 180 || performance.renderCPU.samples < 180) flags.push('incomplete sampling window')
  if (performance.frame.meanMs > performance.frame.p95Ms * 1.1) flags.push('mean affected by long outliers')
  if (performance.frame.meanMs > 100) flags.push('strong throttling or scheduling stalls; visual evidence only')
  return { ...performance, flags, controlledBenchmark: false }
}

const report = { tolerance, pairs: [], unpairedCaptures: [], status: 'pending' }
for (const name of Object.keys(captures)) {
  assert.ok((await stat(join(directory, `${name}.jpg`))).size > 1024, `${name}: screenshot is saved`)
  if (!name.startsWith('warm-')) continue
  const otherName = name.replace(/^warm-/, 'balanced-')
  assert.ok(captures[otherName], `${name}: matching Balanced capture exists`)
  const warm = captures[name], balanced = captures[otherName]
  let cameraDelta = 0
  for (const property of ['position', 'target']) {
    assert.equal(warm.camera[property].length, 3)
    assert.equal(balanced.camera[property].length, 3)
    for (let i = 0; i < 3; i++) {
      const difference = Math.abs(warm.camera[property][i] - balanced.camera[property][i])
      assert.ok(Number.isFinite(difference) && difference <= tolerance, `${name}: camera ${property}[${i}] matches`)
      cameraDelta = Math.max(cameraDelta, difference)
    }
  }
  compareNumericObject(warm.viewport, balanced.viewport, `${name}: viewport and DPR`)
  assert.equal(warm.browser, 'in-app', `${name}: final capture uses the in-app browser`)
  assert.equal(balanced.browser, warm.browser, `${name}: same browser`)
  assert.equal(Boolean(balanced.clip), Boolean(warm.clip), `${name}: clip presence matches`)
  if (warm.clip) compareNumericObject(warm.clip, balanced.clip, `${name}: screenshot clip`)
  assert.equal(warm.island, 'loaded', `${name}: Warm island loaded`)
  assert.equal(balanced.island, 'loaded', `${name}: Balanced island loaded`)
  for (const property of comparableCounts) assert.equal(balanced[property], warm[property], `${name}: ${property} unchanged`)
  assert.equal(warm.growing, 0, `${name}: capture waits for growth to finish`)
  assert.equal(warm.opened, warm.plants, `${name}: all plants opened`)
  assert.ok(warm.near + warm.far > 0, `${name}: imported flora present`)
  report.pairs.push({ view: name.slice(5), screenshots: [name + '.jpg', otherName + '.jpg'], cameraDelta,
    browser: warm.browser, viewport: warm.viewport, clip: warm.clip,
    metricScope: name.includes('-study-') ? 'Garden canvas beneath the specimen overlay; close-up appearance checked visually and by flora tests' : 'Garden canvas',
    counts: Object.fromEntries(comparableCounts.map(property => [property, warm[property]])),
    islandLoaded: true, drawCallDelta: balanced.calls - warm.calls, triangleDelta: balanced.triangles - warm.triangles,
    performance: { warm: timing(warm), balanced: timing(balanced) } })
}
report.unpairedCaptures = Object.keys(captures).filter(name => name.startsWith('balanced-') && !captures[name.replace(/^balanced-/, 'warm-')])
assert.ok(report.pairs.length > 0, 'At least one complete comparison pair is required')
report.status = 'passed'
report.performanceNote = 'Animation-frame and render-call CPU samples only; no GPU timer, focus telemetry, or controlled benchmark. No causal speedup/regression claim.'
await writeFile(join(directory, 'comparison-validation.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ status: report.status, pairs: report.pairs.length, screenshots: Object.keys(captures).length,
  maximumCameraDelta: Math.max(...report.pairs.map(pair => pair.cameraDelta)),
  addedDrawCalls: Math.max(...report.pairs.map(pair => pair.drawCallDelta)),
  addedTriangles: Math.max(...report.pairs.map(pair => pair.triangleDelta)),
  unpairedCaptures: report.unpairedCaptures, evidence: 'comparison-validation.json' }, null, 2))
