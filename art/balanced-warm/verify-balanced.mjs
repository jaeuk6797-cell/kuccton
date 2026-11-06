import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const qa = join(root, 'art/balanced-warm')
const baseline = '536d2acc1e354ac36d0ab21a1b6c752dc15e668b'
const temporary = await mkdtemp(join(qa, '.validation-'))
const sha = value => createHash('sha256').update(value).digest('hex')
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
const report = { baseline, cases: [], colors: {}, blender: {}, environment: {}, protectedAssets: [] }
const arrayHash = array => sha(Buffer.from(array.buffer, array.byteOffset, array.byteLength))

function compileShader(material) {
  const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>',
    fragmentShader: '#include <common>\n#include <color_fragment>\n#include <emissivemap_fragment>\n#include <aomap_fragment>\n#include <opaque_fragment>' }
  material.onBeforeCompile(shader, {})
  return shader
}
const shaders = material => { const shader = compileShader(material); return [shader.vertexShader, shader.fragmentShader] }
function materialState(material) {
  return {
    properties: ['type', 'side', 'vertexColors', 'roughness', 'metalness', 'clearcoat', 'clearcoatRoughness',
      'iridescence', 'iridescenceIOR', 'iridescenceThicknessMinimum', 'iridescenceThicknessMaximum',
      'specularIntensity', 'specularColor', 'color', 'emissive', 'emissiveIntensity', 'envMapIntensity',
      'ior', 'transmission', 'thickness', 'attenuationDistance', 'attenuationColor', 'opacity', 'transparent',
      'flatShading', 'toneMapped', 'normalScale', 'depthWrite', 'depthTest', 'blending']
      .map(key => [key, material[key]?.toArray ? material[key].toArray() : material[key]]),
    shaders: shaders(material),
  }
}
function snapshot(object, appearance = false) {
  object.updateMatrixWorld(true)
  const nodes = []
  object.traverse(node => {
    const entry = { type: node.type, matrix: node.matrix.toArray(), children: node.children.length }
    if (node.isMesh) {
      entry.geometry = Object.fromEntries(Object.entries(node.geometry.attributes)
        .filter(([name]) => appearance || name !== 'color')
        .map(([name, attribute]) => [name, arrayHash(attribute.array)]))
      entry.index = node.geometry.index && arrayHash(node.geometry.index.array)
      if (appearance) entry.material = materialState(node.material)
    }
    nodes.push(entry)
  })
  return nodes
}
function counts(object) {
  let meshes = 0, triangles = 0
  const geometries = new Set(), materials = new Set()
  object.traverse(node => {
    if (!node.isMesh) return
    meshes++
    triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3
    geometries.add(node.geometry); materials.add(node.material)
  })
  return { meshes, triangles, geometries: geometries.size, materials: materials.size }
}
function colorInfo(color) {
  const { h, s, l } = color.getHSL({}, THREE.SRGBColorSpace)
  return { hex: '#' + color.getHexString(), hue: +(h * 360).toFixed(2), saturation: +s.toFixed(3), lightness: +l.toFixed(3) }
}
function assertGreen(color, label) {
  const info = colorInfo(color)
  assert.ok(info.hue >= 60 && info.hue <= 180 && info.saturation >= 0.08, `${label}: expected botanical green, got ${JSON.stringify(info)}`)
  return info
}
function averageVertexColor(geometry) {
  const colors = geometry.attributes.color
  const sum = new THREE.Color(0, 0, 0)
  for (let i = 0; i < colors.count; i++) { sum.r += colors.getX(i); sum.g += colors.getY(i); sum.b += colors.getZ(i) }
  return sum.multiplyScalar(1 / colors.count)
}
async function bundle(sourceRoot, output) {
  const modules = ['flower3d', 'tree3d', 'blenderFlower', 'crystalFlora', 'gardenEnvironment', 'islandTone']
  const contents = modules.map(name => `export * from ${JSON.stringify(join(sourceRoot, 'lib', name + '.js'))}`).join('\n')
    + `\nexport { testApplyOpalReflection } from ${JSON.stringify(join(sourceRoot, 'components/Island3D.jsx'))}`
  await build({ stdin: { contents, resolveDir: root, sourcefile: 'validation-entry.js' },
    outfile: output, bundle: true, platform: 'node', format: 'esm', external: ['three', 'three/*', 'react'],
    define: { 'import.meta.env.BASE_URL': '"/"', 'import.meta.env.DEV': 'false' },
    plugins: [{ name: 'inspection-only', setup(api) {
      api.onLoad({ filter: /Island3D\.jsx$/ }, async args => ({
        contents: await readFile(args.path, 'utf8') + '\nexport { applyOpalReflection as testApplyOpalReflection };', loader: 'jsx',
      }))
      api.onLoad({ filter: /gardenEnvironment\.js$/ }, async args => ({
        contents: (await readFile(args.path, 'utf8')).replace('new THREE.PMREMGenerator(renderer)', 'globalThis.__captureEnvironmentGenerator()'), loader: 'js',
      }))
    } }],
  })
  return import(pathToFileURL(output).href)
}

try {
  assert.equal(git('branch', '--show-current'), 'codex/balanced-warm-flora', 'Verification runs only in the isolated balanced branch')
  assert.equal(git('rev-parse', 'refs/heads/codex/warm-tone-pass'), baseline, 'Preserved Warm branch remains immutable')
  report.branches = { working: 'codex/balanced-warm-flora', warm: baseline,
    observedAurora: git('rev-parse', 'refs/heads/codex/aurora-crystal-garden'),
    note: 'Aurora may advance in a separate authorized chat; this verifier never updates any ref.' }
  const archive = join(temporary, 'source.zip'), restored = join(temporary, 'baseline')
  execFileSync('git', ['archive', '--format=zip', '--output', archive, baseline, 'src'], { cwd: root })
  const quote = value => "'" + value.replaceAll("'", "''") + "'"
  execFileSync('powershell.exe', ['-NoProfile', '-Command',
    `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory(${quote(archive)}, ${quote(restored)})`], { cwd: root })
  const original = await bundle(join(restored, 'src'), join(temporary, 'original.mjs'))
  const current = await bundle(join(root, 'src'), join(temporary, 'current.mjs'))
  const flower = { petals: 6, vowel: 'Y', consonant: '평', rms: 0.045,
    color: '#edacc9', lengths: [0.7, 0.6, 0.9, 0.55, 0.8, 0.65] }

  function checkCase(name, builders) {
    const objects = { oldWarm: builders.original('warm'), oldDefault: builders.original('default'),
      warm: builders.current('warm'), default: builders.current('default'), balanced: builders.current('balanced') }
    for (const opening of [0, 0.25, 0.5, 1]) {
      for (const object of Object.values(objects)) { object.userData.setOpen?.(opening); object.userData.tick?.(0.75) }
      assert.deepEqual(snapshot(objects.warm, true), snapshot(objects.oldWarm, true), `${name}: exact warm appearance at ${opening}`)
      assert.deepEqual(snapshot(objects.default, true), snapshot(objects.oldDefault, true), `${name}: exact default appearance at ${opening}`)
      assert.deepEqual(snapshot(objects.balanced), snapshot(objects.warm), `${name}: balanced geometry/pose unchanged at ${opening}`)
    }
    assert.deepEqual(counts(objects.balanced), counts(objects.warm), `${name}: unchanged draw complexity`)
    report.cases.push({ name, ...counts(objects.balanced), warmAndDefaultExact: true, balancedGeometryAndGrowthUnchanged: true })
    return objects
  }
  const release = objects => Object.values(objects).forEach(current.disposeFlower3D)
  const categoryColors = [], botanical = []
  for (const [category, hue] of Object.entries({ joy: 48, excited: 28, flutter: 335, cozy: 140, calm: 175, sad: 225, tense: 270 })) {
    const data = { ...flower, category, color: `hsl(${hue} 60% 58%)` }, beforeData = JSON.stringify(data)
    const objects = checkCase(category, {
      original: tone => original.buildFlower3D(data, [data.color], { tone }),
      current: tone => current.buildFlower3D(data, [data.color], { tone }),
    })
    const mapped = colorInfo(current.floraColor(current.toColor(data.color), 'balanced'))
    const hueError = Math.abs(((mapped.hue - hue + 540) % 360) - 180)
    assert.ok(hueError <= 30, `${category}: emotional hue family retained`)
    categoryColors.push({ category, inputHue: hue, ...mapped, hueError: +hueError.toFixed(2) })
    botanical.push({ category,
      stem: assertGreen(objects.balanced.children[0].material.color, `${category} stem`),
      leaf: assertGreen(averageVertexColor(objects.balanced.children[1].geometry), `${category} leaf`) })
    assert.equal(JSON.stringify(data), beforeData, 'Stored input data must not be recolored')
    release(objects)
  }
  assert.equal(new Set(categoryColors.map(color => color.hex)).size, 7)
  assert.ok(new Set(categoryColors.map(color => Math.floor(color.hue / 45))).size >= 5, 'Seven categories retain broad hue diversity')
  const sounds = [25, 100, 180, 245].map(hue => ({ inputHue: hue,
    ...colorInfo(current.floraColor(new THREE.Color().setHSL(hue / 360, 0.65, 0.6, THREE.SRGBColorSpace), 'balanced')) }))
  assert.equal(new Set(sounds.map(color => color.hex)).size, sounds.length)
  for (const color of sounds) assert.ok(Math.abs(((color.hue - color.inputHue + 540) % 360) - 180) <= 30, 'Sound source hue retained')
  report.colors = { categories: categoryColors, sounds, botanical }

  const pairColors = ['#edacc9', '#89cdbd']
  const pairs = checkCase('pair', {
    original: tone => original.buildFlower3D(flower, pairColors, { pair: true, tone }),
    current: tone => current.buildFlower3D(flower, pairColors, { pair: true, tone }),
  })
  const repeat = current.buildFlower3D(flower, pairColors, { pair: true, tone: 'balanced' })
  repeat.userData.setOpen(1)
  assert.deepEqual(snapshot(repeat, true), snapshot(pairs.balanced, true), 'Repeated pair creation is deterministic')
  const petalColors = new Set()
  pairs.balanced.traverse(node => { if (node.isMesh && node.material.isMeshPhysicalMaterial) petalColors.add(arrayHash(node.geometry.attributes.color.array)) })
  assert.ok(petalColors.size >= 2, 'Pair retains more than one source-colored petal family')
  report.colors.pair = { deterministic: true, distinctPetalColorArrays: petalColors.size }
  current.disposeFlower3D(repeat); release(pairs)
  report.colors.trees = []
  for (const [kind, properties] of Object.entries({ round: { root: '톡' }, pine: { root: '타닥', consonant: '격' }, willow: { root: '살랑' } })) {
    const data = { ...flower, ...properties, category: 'sound', color: 'hsl(185 60% 52%)' }
    const objects = checkCase(kind, { original: tone => original.buildTree3D(data, { tone }), current: tone => current.buildTree3D(data, { tone }) })
    const crowns = new Set()
    objects.balanced.traverse(node => { if (node.isMesh && node.geometry.attributes.color) crowns.add(node.geometry) })
    report.colors.trees.push({ kind, crowns: [...crowns].map(geometry => assertGreen(averageVertexColor(geometry), `${kind} crown`)) })
    release(objects)
  }
  report.colors.soundTrees = sounds.map(({ inputHue }) => {
    const tree = current.buildTree3D({ ...flower, category: 'sound', root: '톡', color: `hsl(${inputHue} 60% 52%)` }, { tone: 'balanced' })
    let crown
    tree.traverse(node => { if (!crown && node.isMesh && node.geometry.attributes.color) crown = node.geometry })
    const color = assertGreen(averageVertexColor(crown), `Sound hue ${inputHue} tree crown`)
    current.disposeFlower3D(tree)
    return { inputHue, crown: color }
  })
  assert.equal(new Set(report.colors.soundTrees.map(tree => tree.crown.hex)).size, sounds.length,
    'Different sound colors retain distinguishable botanical crown tints')

  for (const file of ['public/models/island.glb', 'public/models/flora/crystal_flower.glb',
    'public/models/flora/crystal_flower_lod.glb', 'art/flora/crystal_flower.blend']) {
    const bytes = await readFile(join(root, file)), originalBytes = execFileSync('git', ['show', `${baseline}:${file}`], { cwd: root })
    assert.equal(sha(bytes), sha(originalBytes), `${file}: protected asset unchanged`)
    report.protectedAssets.push({ file, sha256: sha(bytes), unchanged: true })
  }
  const assets = {}, loader = new GLTFLoader()
  for (const [level, suffix] of [['near', ''], ['far', '_LOD']]) {
    const bytes = await readFile(join(root, `public/models/flora/crystal_flower${suffix ? '_lod' : ''}.glb`))
    const { scene } = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
    assets[level] = { scene, suffix }
  }
  const bounds = new THREE.Box3().setFromObject(assets.near.scene).getSize(new THREE.Vector3())
  Object.assign(assets, { height: bounds.y, width: Math.max(bounds.x, bounds.z) })
  const sourceBefore = [snapshot(assets.near.scene, true), snapshot(assets.far.scene, true)]
  const models = { oldWarm: original.buildBlenderFlower(flower, assets, { tone: 'warm' }),
    oldDefault: original.buildBlenderFlower(flower, assets, { tone: 'default' }),
    warm: current.buildBlenderFlower(flower, assets, { tone: 'warm' }),
    default: current.buildBlenderFlower(flower, assets, { tone: 'default' }),
    balanced: current.buildBlenderFlower(flower, assets, { tone: 'balanced' }) }
  const peer = current.buildBlenderFlower(flower, assets, { tone: 'balanced' })
  const petalMaterial = object => object.getObjectByName('Outer_Petal_Pivot').material
  assert.equal(petalMaterial(models.balanced), petalMaterial(peer), 'Matching balanced variants share materials')
  assert.notEqual(petalMaterial(models.balanced), petalMaterial(models.warm), 'Tone variants are isolated')
  const petalShader = compileShader(petalMaterial(models.balanced))
  assert.ok(petalShader.uniforms.balancedPetalPearl?.value?.isColor, 'Balanced pearl highlight uniform is bound')
  assert.match(petalShader.fragmentShader, /mix\(diffuse, balancedPetalPearl, opalPearlHighlight\)/,
    'Live material hue supplies the Blender petal body instead of baked pink vertex colors')
  assert.match(petalShader.fragmentShader, /dot\(vColor\.rgb,/, 'Baked facet shading is retained as luminance')
  assert.match(petalShader.fragmentShader, /smoothstep\(0\.65, 0\.84, opalFacetValue\) \* 0\.22/,
    'Pearl is limited to a bounded bright-facet highlight')
  assert.doesNotMatch(petalShader.fragmentShader, /diffuseColor\.a\s*=/, 'Petal shader preserves opacity')
  const blenderPetalColors = categoryColors.map(({ category, inputHue }) => {
    const data = { ...flower, category, color: `hsl(${inputHue} 60% 58%)` }
    const model = current.buildBlenderFlower(data, assets, { tone: 'balanced' })
    const material = petalMaterial(model), expected = current.floraColor(current.toColor(data.color), 'balanced')
    assert.deepEqual(material.color.toArray(), expected.toArray(), `${category}: Blender body retains exact mapped source hue`)
    const result = { category, ...colorInfo(material.color) }
    model.userData.dispose()
    return result
  })
  assert.equal(new Set(blenderPetalColors.map(color => color.hex)).size, 7, 'Blender category bodies remain seven distinct colors')
  let mineral
  models.balanced.traverse(node => { if (node.isMesh && node.material.name === '02 | Aqua mineral') mineral = node.material })
  assert.ok(mineral, 'Blender stem/leaf mineral material exists')
  const mineralShader = compileShader(mineral)
  const mineralGreens = Object.fromEntries(['balancedShadowGreen', 'balancedLeafGreen'].map(name => {
    assert.ok(mineralShader.uniforms[name]?.value?.isColor, `${name}: green shader color is bound`)
    assert.ok(mineralShader.fragmentShader.includes(name), `${name}: green shader color is consumed`)
    return [name, assertGreen(mineralShader.uniforms[name].value, name)]
  }))
  assert.ok(mineral.roughness >= 0.4, 'Blender green structure retains a soft satin response')
  const dimmed = current.buildBlenderFlower(flower, assets, { tone: 'balanced', dimmed: true })
  assert.notEqual(petalMaterial(dimmed), petalMaterial(models.balanced), 'Dimming has an isolated material')
  petalMaterial(dimmed).opacity = 0.22
  assert.notEqual(petalMaterial(models.balanced).opacity, 0.22, 'Dimming cannot fade a normal instance')
  dimmed.userData.dispose()
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 500)
  const scale = (0.55 + 0.25 * current.flowerParams(flower).size) / assets.height
  const sequence = []
  for (const pixels of [60, 33]) {
    camera.position.set(0, 0, assets.width * scale * camera.projectionMatrix.elements[5] * 844 / (2 * pixels))
    camera.updateMatrixWorld(true)
    for (const opening of [0, 0.25, 0.5, 1]) {
      for (const model of Object.values(models)) { model.userData.setOpen(opening); model.updateMatrixWorld(true); model.userData.updateLOD(camera, 844, 1) }
      assert.deepEqual(snapshot(models.balanced), snapshot(models.warm), `Blender growth unchanged at ${pixels}px/${opening}`)
      assert.deepEqual(snapshot(models.warm, true), snapshot(models.oldWarm, true), `Blender warm growth exact at ${pixels}px/${opening}`)
      assert.deepEqual(snapshot(models.default, true), snapshot(models.oldDefault, true), `Blender default growth exact at ${pixels}px/${opening}`)
    }
  }
  for (const pixels of [60, 41, 33, 41, 50]) {
    camera.position.set(0, 0, assets.width * scale * camera.projectionMatrix.elements[5] * 844 / (2 * pixels))
    camera.updateMatrixWorld(true)
    for (const model of Object.values(models)) { model.userData.setOpen(1); model.updateMatrixWorld(true); model.userData.updateLOD(camera, 844, 1) }
    assert.deepEqual(snapshot(models.warm, true), snapshot(models.oldWarm, true), `Blender warm exact at ${pixels}px`)
    assert.deepEqual(snapshot(models.default, true), snapshot(models.oldDefault, true), `Blender default exact at ${pixels}px`)
    assert.deepEqual(snapshot(models.balanced), snapshot(models.warm), `Blender balanced geometry exact at ${pixels}px`)
    assert.deepEqual(counts(models.balanced), counts(models.warm))
    assert.equal(models.balanced.children.length, 1)
    sequence.push(models.balanced.userData.lod)
  }
  assert.deepEqual(sequence, ['near', 'near', 'far', 'far', 'near'])
  let disposed = 0
  petalMaterial(models.balanced).addEventListener('dispose', () => disposed++)
  models.balanced.userData.dispose(); assert.equal(disposed, 0)
  peer.userData.dispose(); assert.equal(disposed, 1)
  peer.userData.dispose(); assert.equal(disposed, 1)
  for (const [name, model] of Object.entries(models)) if (name !== 'balanced') model.userData.dispose()
  assert.deepEqual([snapshot(assets.near.scene, true), snapshot(assets.far.scene, true)], sourceBefore, 'Cached GLB sources remain unchanged')
  report.blender = { warmAndDefaultAppearanceExact: true, balancedGeometryUnchanged: true, lodSequence: sequence,
    materialSharingAndToneIsolation: true, lastLeaseDisposal: true, cachedSourceUnmodified: true,
    dimmingIsolated: true, bothLODGrowthStagesPreserved: true, botanicalMineralUniforms: mineralGreens,
    sourceHuePetalBodies: blenderPetalColors, boundedPearlHighlights: true, petalOpacityPreserved: true }

  globalThis.__captureEnvironmentGenerator = () => ({ fromScene(studio) { return { studio } }, dispose() {} })
  for (const tone of ['warm', 'default']) {
    const before = original.createGardenEnvironment({}, 256, tone).studio
    const after = current.createGardenEnvironment({}, 256, tone).studio
    assert.deepEqual(snapshot(after, true), snapshot(before, true), `${tone}: exact environment cards`)
    assert.deepEqual(after.background.toArray(), before.background.toArray(), `${tone}: exact environment background`)
    const oldGround = new THREE.MeshPhysicalMaterial(), ground = new THREE.MeshPhysicalMaterial()
    for (const material of [oldGround, ground]) material.name = 'SUP Opalescent ground'
    if (tone === 'warm') { original.applyWarmIslandMaterial(oldGround); current.applyWarmIslandMaterial(ground) }
    original.testApplyOpalReflection(oldGround, tone); current.testApplyOpalReflection(ground, tone)
    assert.deepEqual(materialState(ground), materialState(oldGround), `${tone}: exact opal material/shader`)
    report.environment[tone] = { cardsAndBackgroundExact: true, opalMaterialAndShaderExact: true }
  }
  delete globalThis.__captureEnvironmentGenerator
  const oldCSS = await readFile(join(restored, 'src/styles.css'), 'utf8'), newCSS = await readFile(join(root, 'src/styles.css'), 'utf8')
  assert.equal(/--sky:\s*([^;]+)/.exec(newCSS)?.[1], /--sky:\s*([^;]+)/.exec(oldCSS)?.[1], 'Original warm sky remains exact')
  report.environment.warmSkyExact = true
  assert.equal(git('rev-parse', 'refs/heads/codex/warm-tone-pass'), baseline)
  report.status = 'passed'
  await writeFile(join(qa, 'validation.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ status: report.status, cases: report.cases.length, colors: report.colors,
    blender: report.blender, environment: report.environment, branches: report.branches }, null, 2))
} finally {
  assert.equal(dirname(resolve(temporary)), qa)
  await rm(temporary, { recursive: true, force: true })
}
