import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'

const folder = new URL('../art/garden-themes/', import.meta.url)
const read = async name => JSON.parse(await readFile(new URL(name, folder), 'utf8'))
const [browser, production, retry, baseline] = await Promise.all([
  read('browser-results.json'), read('production-results.json'), read('retry-results.json'), read('baseline-performance.json'),
])
assert.equal(browser.passed, true)
assert.equal(production.passed, true)
assert.equal(retry.passed, true)
assert.deepEqual(baseline.errors, [])
assert.equal(baseline.cases.length, 4)
const themes = { balanced: 'Balanced Warm', warm: 'Warm Opal', aurora: 'Aurora Crystal', default: 'Original Opal' }
const number = value => Number(value).toLocaleString('en-US')
const signed = value => `${value > 0 ? '+' : ''}${number(value)}`
const rows = size => Object.entries(themes).map(([id, name]) => {
  const sample = browser.samples[`${id}-${size}`]
  return `| ${name} | ${number(sample.calls)} | ${number(sample.triangles)} | ${sample.performance.renderCPU.meanMs} | ${sample.performance.gpu.meanMs} | ${sample.performance.frame.meanMs} |`
}).join('\n')
const changes = baseline.cases.map(({ tone, source, integration, delta }) => `| ${themes[tone]} | ${number(source.calls)} → ${number(integration.calls)} | ${number(source.triangles)} → ${number(integration.triangles)} | ${signed(delta.calls)} | ${signed(delta.triangles)} | ${delta.renderCpuMeanMs > 0 ? '+' : ''}${delta.renderCpuMeanMs} |`).join('\n')
const checks = [...browser.checks, ...production.checks.map(check => check.name), ...retry.checks].map(check => `- Passed: ${check}`).join('\n')
const markdown = `# SUP garden theme integration — verification

Branch: \`codex/garden-theme-selector\`. Started from \`origin/main\` at \`05c7efd\`, then incorporated its newer album/friend/tutorial changes through \`f8cfac4\`. No changes were merged into or pushed to main. Historical visual branches and their artifacts were not overwritten.

Balanced Warm is the default. All four themes are available from Me → **정원 테마**, with an explicit selected state and personal account-scoped storage. The new shared grass requirement from the authorized island conversation is included from \`e24cc39\` (resized geometry based on \`6da2b6f\`). Warm/Original retain their archived island geometry; their added grass is the explicitly approved exception to the older appearance.

[Four-theme visual comparison](comparison.html) · [Mobile selector](theme-selector-mobile.png) · [Implementation and reproduction notes](../../docs/GARDEN_THEMES.md)

## Screenshots at the same pose

| Balanced Warm | Warm Opal | Aurora Crystal | Original Opal |
| --- | --- | --- | --- |
| [Garden](balanced-garden.png) | [Garden](warm-garden.png) | [Garden](aurora-garden.png) | [Garden](default-garden.png) |
| [50 received plants](balanced-dense50.png) | [50 received plants](warm-dense50.png) | [50 received plants](aurora-dense50.png) | [50 received plants](default-dense50.png) |
| [Mobile](balanced-mobile50.png) | [Mobile](warm-mobile50.png) | [Mobile](aurora-mobile50.png) | [Mobile](default-mobile50.png) |

These are the actual Garden component, with deterministic sound fixtures. The four garden comparisons retain exactly the same camera and frozen animation time. Separate \`production-*.png\` screenshots verify the compiled authenticated App with all seven emotion categories, three tree variants and a pair.

## Results

- Production build: passed. Vite reports the bundle-size warning for the main Three.js application chunk; no build errors.
- Node checks: **28 passed**, including the existing audio/push tests, preference isolation, grass resource ownership, exact source geometry/material/growth comparisons, and historical island shader checks.
- Actual Garden browser suite: **${browser.checks.length} passed**.
- Production App/account/audio suite: **${production.checks.length} passed**.
- Failure/retry/rapid-switch suite: **${retry.checks.length} passed**.
- Runtime/shader errors: **zero** in normal runs. Retry tests separately record the one intentionally failed asset request.
- Twelve repeated switches converge to identical geometry, texture and shader-program counts. Grass retains one visible draw and two bounded model-variant layouts, reusing their mesh/geometry/instance-buffer identities across palettes.
- An existing logout race was fixed: a queued garden refresh now safely handles the session disappearing before its auth lookup completes.

## Actual garden performance

Chrome ${browser.browserVersion}; ${browser.webglRenderer}. Browser viewport 1280 × 900, actual garden canvas 520 × 900, DPR 1. Each measurement uses 180 post-warmup samples at a fixed pose. Draw calls and triangles include shadows and postprocessing; grass by itself is one draw, 1,000 clumps and 6,000 triangles in all themes.

12 received plants plus 2 pair flowers:

| Theme | Draw calls | Triangles/frame | CPU render mean, ms | GPU mean, ms | Frame interval mean, ms |
| --- | ---: | ---: | ---: | ---: | ---: |
${rows(14)}

50 received plants plus 2 pair flowers:

| Theme | Draw calls | Triangles/frame | CPU render mean, ms | GPU mean, ms | Frame interval mean, ms |
| --- | ---: | ---: | ---: | ---: | ---: |
${rows(52)}

## Comparison against preserved implementations

The separate 50-plant mixed-flora comparison uses identical generated sound records, camera position/target, 36° field of view, viewport, frozen time and Blender near/far LOD counts. The source camera first approaches the plants to align the LOD hysteresis state before returning to the comparison pose. Exact source renderers/assets were extracted into ignored local directories from Balanced \`bbc538b\` and Aurora \`2af54a7\`. Warm and Original paths in the Balanced snapshot match \`536d2ac\`, independently verified by the source-equivalence tests. See [raw baseline data](baseline-performance.json).

| Theme | Source → integrated draw calls | Source → integrated triangles | Draw delta | Triangle delta | CPU mean delta, ms |
| --- | ---: | ---: | ---: | ---: | ---: |
${changes}

Balanced's changed counts reflect the approved modern island and grass. Warm/Original add one instanced grass draw under the newer requirement. Aurora keeps its existing geometry budget. Wall-clock CPU/GPU times are observations on a shared development machine and can vary with system load; draw/triangle deltas are deterministic. Mobile layouts were exercised at 390 × 844, not on physical iOS/Android hardware.

## Test detail

${checks}

## Limits

- Authentication, Supabase responses, profile RPCs and audio storage were local fixtures. The production UI and code paths were exercised, but no live account, garden or database was modified.
- Physical-device performance, native Capacitor restarts and cross-device synchronization were not tested. Browser process restart was tested; cross-device preference sync is outside this phase.
- Font CDN responses were stubbed in the production fixture to keep tests independent of network availability. Browser fixture screenshots otherwise use the app's normal font stack.
- A failed island download retains the last complete scene and offers retry in Me. Storage failures retain the selected theme only for the current session and display a saving notice.

Raw evidence: [Garden browser results](browser-results.json), [production results](production-results.json), [retry results](retry-results.json), [baseline comparison](baseline-performance.json).
`
await writeFile(new URL('REPORT.md', folder), markdown)

const cards = Object.entries(themes).map(([id, name]) => `<figure><figcaption>${name}</figcaption><a href="${id}-garden.png"><img data-tone="${id}" src="${id}-garden.png" alt="${name} actual garden"></a></figure>`).join('\n')
await writeFile(new URL('comparison.html', folder), `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SUP — four garden themes</title>
<style>body{font:15px system-ui,sans-serif;margin:24px;background:#f5f2ed;color:#252a2a}h1{font-size:24px;margin-bottom:6px}p{color:#59615b}nav{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0}button{font:inherit;border:1px solid #b7c0b6;border-radius:8px;background:white;padding:10px 16px;cursor:pointer}button[aria-pressed=true]{background:#456d41;color:white}main{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}figure{margin:0}figcaption{font-weight:650;margin:0 0 8px}img{width:100%;height:auto;display:block;border-radius:12px;border:1px solid #dedbd5}@media(max-width:850px){main{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:430px){main{grid-template-columns:1fr}}a{color:inherit}</style>
<h1>SUP personal garden themes</h1><p>Balanced Warm is the default. Same camera and animation time across all four views.</p><p><a href="REPORT.md">Verification report</a> · <a href="theme-selector-mobile.png">Mobile Me selector</a></p>
<nav aria-label="Comparison view"><button data-view="garden" aria-pressed="true">Garden</button><button data-view="dense50" aria-pressed="false">50 received plants</button><button data-view="mobile50" aria-pressed="false">Mobile</button></nav><main>${cards}</main>
<script>document.querySelectorAll('button[data-view]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('button[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));document.querySelectorAll('img[data-tone]').forEach(img=>{img.src=img.dataset.tone+'-'+button.dataset.view+'.png';img.parentElement.href=img.src})}));</script></html>`)
console.log('Wrote REPORT.md and comparison.html from passing test evidence')
