import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

// Run from any directory: node art/warm-tone/verify-materials.mjs [report.json]
// Compare presentation changes against the original mixed-flora commit, without a WebGL context.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const baseline = '22a1b5d'
const temporary = await mkdtemp(join(root, 'art/warm-tone/.validation-'))
const sha = value => createHash('sha256').update(value).digest('hex')
const report = { baseline, cases: [], blender: {}, protectedAssets: [] }

function bufferHash(array) {
  return sha(Buffer.from(array.buffer, array.byteOffset, array.byteLength))
}

function snapshot(object, appearance = false) {
  object.updateMatrixWorld(true)
  const nodes = []
  object.traverse(node => {
    const entry = { type: node.type, matrix: node.matrix.toArray(), children: node.children.length }
    if (node.isMesh) {
      entry.geometry = Object.fromEntries(Object.entries(node.geometry.attributes)
        .filter(([name]) => appearance || name !== 'color')
        .map(([name, attribute]) => [name, bufferHash(attribute.array)]))
      entry.index = node.geometry.index && bufferHash(node.geometry.index.array)
      if (appearance) entry.material = ['type', 'side', 'vertexColors', 'roughness', 'metalness',
        'clearcoat', 'clearcoatRoughness', 'iridescence', 'iridescenceIOR', 'iridescenceThicknessMinimum', 'iridescenceThicknessMaximum',
        'specularIntensity', 'color', 'emissive', 'opacity', 'transparent', 'flatShading']
        .map(key => [key, node.material[key]?.isColor ? node.material[key].toArray() : node.material[key]])
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
    geometries.add(node.geometry)
    materials.add(node.material)
  })
  return { meshes, triangles, geometries: geometries.size, materials: materials.size }
}

async function bundle(sourceRoot, output) {
  const modules = ['flower3d', 'tree3d', 'blenderFlower']
  await build({
    stdin: { contents: modules.map(name => `export * from ${JSON.stringify(join(sourceRoot, name + '.js'))}`).join('\n'),
      resolveDir: root, sourcefile: 'validation-entry.js' },
    outfile: output, bundle: true, platform: 'node', format: 'esm',
    external: ['three', 'three/*', 'react'], define: { 'import.meta.env.BASE_URL': '"/"' },
  })
  return import(pathToFileURL(output).href)
}

try {
  const originalDir = join(temporary, 'original')
  await mkdir(originalDir)
  for (const name of ['flower3d', 'tree3d', 'blenderFlower', 'crystalFlora', 'tree', 'flower', 'soundFeatures']) {
    const source = execFileSync('git', ['show', `${baseline}:src/lib/${name}.js`], { cwd: root })
    await writeFile(join(originalDir, `${name}.js`), source)
  }
  const original = await bundle(originalDir, join(temporary, 'original.mjs'))
  const current = await bundle(join(root, 'src/lib'), join(temporary, 'current.mjs'))
  const flower = { petals: 6, vowel: 'Y', consonant: '평', rms: 0.045,
    color: '#edacc9', lengths: [0.7, 0.6, 0.9, 0.55, 0.8, 0.65] }

  function checkCase(name, before, control, warm) {
    for (const opening of [0, 0.25, 0.5, 1]) {
      for (const object of [before, control, warm]) {
        object.userData.setOpen?.(opening)
        object.userData.tick?.(0.75)
      }
      assert.deepEqual(snapshot(control, true), snapshot(before, true), `${name}: default preserves original at ${opening}`)
      assert.deepEqual(snapshot(warm), snapshot(control), `${name}: geometry and pose unchanged at ${opening}`)
    }
    assert.notDeepEqual(snapshot(warm, true), snapshot(control, true), `${name}: warm changes presentation`)
    assert.deepEqual(counts(warm), counts(control), `${name}: mesh and material counts unchanged`)
    report.cases.push({ name, ...counts(warm), originalPreserved: true, geometryAndGrowthUnchanged: true })
    for (const object of [before, control, warm]) current.disposeFlower3D(object)
  }

  const hues = { joy: 48, excited: 28, flutter: 335, cozy: 140, calm: 175, sad: 225, tense: 270 }
  for (const [category, hue] of Object.entries(hues)) {
    const data = { ...flower, category, color: `hsl(${hue} 60% 58%)` }
    checkCase(category, original.buildFlower3D(data),
      current.buildFlower3D(data, [data.color], { tone: 'default' }), current.buildFlower3D(data))
  }
  const pairColors = ['#edacc9', '#89cdbd']
  checkCase('pair', original.buildFlower3D(flower, pairColors, { pair: true }),
    current.buildFlower3D(flower, pairColors, { pair: true, tone: 'default' }),
    current.buildFlower3D(flower, pairColors, { pair: true }))
  for (const [kind, properties] of Object.entries({
    round: { root: '톡' }, pine: { root: '타닥', consonant: '격' }, willow: { root: '살랑' },
  })) {
    const data = { ...flower, ...properties, category: 'sound', color: 'hsl(185 60% 52%)' }
    checkCase(kind, original.buildTree3D(data), current.buildTree3D(data, { tone: 'default' }), current.buildTree3D(data))
  }

  const loader = new GLTFLoader()
  const assets = {}
  const islandFile = 'public/models/island.glb'
  const islandBytes = await readFile(join(root, islandFile))
  assert.equal(sha(islandBytes), sha(execFileSync('git', ['show', `${baseline}:${islandFile}`], { cwd: root })),
    'island asset remains byte-identical')
  report.protectedAssets.push({ file: islandFile, sha256: sha(islandBytes), unchanged: true })
  for (const [level, suffix] of [['near', ''], ['far', '_LOD']]) {
    const file = `public/models/flora/crystal_flower${suffix ? '_lod' : ''}.glb`
    const data = await readFile(join(root, file))
    const historical = execFileSync('git', ['show', `${baseline}:${file}`], { cwd: root })
    assert.equal(sha(data), sha(historical), `${file}: asset remains byte-identical`)
    const { scene } = await loader.parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '')
    assets[level] = { scene, suffix }
    report.protectedAssets.push({ file, sha256: sha(data), unchanged: true })
  }
  const bounds = new THREE.Box3().setFromObject(assets.near.scene).getSize(new THREE.Vector3())
  Object.assign(assets, { height: bounds.y, width: Math.max(bounds.x, bounds.z) })
  const sourceBefore = [snapshot(assets.near.scene, true), snapshot(assets.far.scene, true)]
  const before = original.buildBlenderFlower(flower, assets)
  const control = current.buildBlenderFlower(flower, assets, { tone: 'default' })
  const warm = current.buildBlenderFlower(flower, assets)
  const warmPeer = current.buildBlenderFlower(flower, assets)
  const materialOf = object => object.getObjectByName('Outer_Petal_Pivot').material
  assert.equal(materialOf(warm), materialOf(warmPeer), 'same tint and tone shares a material')
  assert.notEqual(materialOf(warm), materialOf(control), 'default and warm never share mutable material')
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 500)
  const scale = (0.55 + 0.25 * current.flowerParams(flower).size) / assets.height
  const sequence = []
  for (const pixels of [60, 41, 33, 41, 50]) {
    camera.position.set(0, 0, assets.width * scale * camera.projectionMatrix.elements[5] * 844 / (2 * pixels))
    camera.updateMatrixWorld(true)
    for (const object of [before, control, warm]) {
      object.userData.setOpen(1)
      object.updateMatrixWorld(true)
      object.userData.updateLOD(camera, 844, 1)
    }
    assert.deepEqual(snapshot(control, true), snapshot(before, true), `Blender default preserved at ${pixels}px`)
    assert.deepEqual(snapshot(warm), snapshot(control), `Blender pose/geometry preserved at ${pixels}px`)
    assert.deepEqual(counts(warm), counts(control), `Blender draw complexity preserved at ${pixels}px`)
    sequence.push(warm.userData.lod)
    assert.equal(warm.children.length, 1, 'exactly one visible LOD hierarchy')
  }
  assert.deepEqual(sequence, ['near', 'near', 'far', 'far', 'near'])
  const material = materialOf(warm)
  let disposed = 0
  material.addEventListener('dispose', () => disposed++)
  warm.userData.dispose()
  assert.equal(disposed, 0, 'removing one instance preserves a surviving lease')
  warmPeer.userData.dispose()
  assert.equal(disposed, 1, 'last lease releases shared material exactly once')
  warmPeer.userData.dispose()
  assert.equal(disposed, 1, 'repeated cleanup is harmless')
  before.userData.dispose()
  control.userData.dispose()
  assert.deepEqual([snapshot(assets.near.scene, true), snapshot(assets.far.scene, true)], sourceBefore,
    'runtime material variants leave cached GLB scenes untouched')
  report.blender = { lodSequence: sequence, identicalGeometryAndPoses: true,
    defaultAppearancePreserved: true, sourceMaterialsUntouched: true, materialLeaseLifetimePassed: true }
  report.status = 'passed'
  const text = JSON.stringify(report, null, 2) + '\n'
  if (process.argv[2]) await writeFile(resolve(process.argv[2]), text)
  console.log(text)
} finally {
  // This path is the unique directory created by mkdtemp above, inside the QA directory.
  assert.equal(dirname(resolve(temporary)), join(root, 'art/warm-tone'))
  await rm(temporary, { recursive: true, force: true })
}
