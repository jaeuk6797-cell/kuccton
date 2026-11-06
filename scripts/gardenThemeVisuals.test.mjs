import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { buildFlower3D, disposeFlower3D } from '../src/lib/flower3d.js'
import { buildTree3D } from '../src/lib/tree3d.js'
import { treeParams } from '../src/lib/tree.js'

const root = new URL('../', import.meta.url)
const sourceVersions = { balanced: 'bbc538b', warm: '536d2ac', aurora: '2af54a7', default: '536d2ac' }
const moduleCache = new Map()
const dataModule = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`

// Load the approved implementations directly from Git so a future palette or
// mesh change cannot silently redefine one of the preserved alternatives.
function sourceModule(commit, path) {
  const key = `${commit}:${path}`
  if (moduleCache.has(key)) return moduleCache.get(key)
  let code = commit
    ? execFileSync('git', ['show', key], { cwd: fileURLToPath(root), encoding: 'utf8' })
    : readFileSync(new URL(path, root), 'utf8')
  code = code.replaceAll('import.meta.env.BASE_URL', "'/'")
  code = code.replace(/from '([^']+)'/g, (_, specifier) => {
    if (!specifier.startsWith('.')) return `from '${import.meta.resolve(specifier)}'`
    const relative = new URL(specifier, new URL(path, root))
    const target = relative.pathname.replace(root.pathname, '')
    const module = ['src/lib/crystalFlora.js', 'src/lib/flower3d.js'].includes(target)
      ? sourceModule(commit, target) : relative.href
    return `from '${module}'`
  })
  const url = dataModule(code)
  moduleCache.set(key, url)
  return url
}

const hash = value => createHash('sha256').update(value).digest('hex')
function arrayHash(array) {
  return hash(Buffer.from(array.buffer, array.byteOffset, array.byteLength))
}
function materialSignature(material) {
  const json = material.toJSON()
  delete json.uuid
  delete json.metadata
  const shader = {
    uniforms: {},
    vertexShader: '#include <common>\n#include <begin_vertex>',
    fragmentShader: '#include <common>\n#include <color_fragment>\n#include <aomap_fragment>',
  }
  material.onBeforeCompile(shader, null)
  return { json, shader }
}
function signature(group) {
  const nodes = []
  group.traverse(node => {
    nodes.push({
      type: node.type,
      position: node.position.toArray(),
      quaternion: node.quaternion.toArray(),
      scale: node.scale.toArray(),
      geometry: node.geometry && {
        attributes: Object.fromEntries(Object.entries(node.geometry.attributes).map(([key, attr]) => [key, arrayHash(attr.array)])),
        index: node.geometry.index && arrayHash(node.geometry.index.array),
      },
      material: node.material && materialSignature(node.material),
    })
  })
  return hash(JSON.stringify(nodes))
}

const flower = {
  id: 'sound-identity', color: 'hsl(214 68% 74%)', vowel: 'E', consonant: '격',
  rms: 0.081, petals: 7, lengths: [0.4, 1.5, 0.75, 1.2, 0.9, 0.5, 1.1],
}

for (const [tone, commit] of Object.entries(sourceVersions)) {
  test(`${tone}: all seven procedural flowers and pair retain approved geometry, materials, shaders, and growth`, async () => {
    const original = await import(sourceModule(commit, 'src/lib/flower3d.js'))
    for (const category of ['joy', 'excited', 'flutter', 'cozy', 'calm', 'sad', 'tense', 'pair']) {
      const input = { ...flower, category }
      const before = JSON.stringify(input)
      const options = { tone, pair: category === 'pair' }
      const colors = options.pair ? [input.color, 'hsl(338 71% 69%)'] : [input.color]
      const actual = buildFlower3D(input, colors, options)
      const expected = original.buildFlower3D(input, colors, options)
      actual.userData.setOpen(0.62)
      expected.userData.setOpen(0.62)
      assert.equal(signature(actual), signature(expected), category)
      assert.equal(JSON.stringify(input), before, 'source sound data stays unchanged')
      disposeFlower3D(actual)
      original.disposeFlower3D(expected)
    }
  })
  test(`${tone}: all three trees retain approved geometry, materials, and growth`, async () => {
    const original = await import(sourceModule(commit, 'src/lib/tree3d.js'))
    const kinds = []
    for (const input of [
      { ...flower, category: 'sound', root: '톡', consonant: '평' },
      { ...flower, category: 'sound', root: '탁', consonant: '격' },
      { ...flower, category: 'sound', root: '쏴아', consonant: '평' },
    ]) {
      kinds.push(treeParams(input).kind)
      const actual = buildTree3D(input, { tone })
      const expected = original.buildTree3D(input, { tone })
      actual.userData.setOpen(0.62)
      expected.userData.setOpen(0.62)
      assert.equal(signature(actual), signature(expected), input.root)
      disposeFlower3D(actual)
      disposeFlower3D(expected)
    }
    assert.deepEqual(kinds, ['round', 'pine', 'willow'])
  })
}

const loader = new GLTFLoader()
const loadLevel = async suffix => {
  const bytes = await readFile(new URL(`public/models/flora/crystal_flower${suffix ? '_lod' : ''}.glb`, root))
  const { scene } = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
  return { scene, suffix }
}
const [near, far] = await Promise.all([loadLevel(''), loadLevel('_LOD')])
const size = new THREE.Box3().setFromObject(near.scene).getSize(new THREE.Vector3())
const assets = { near, far, height: size.y, width: Math.max(size.x, size.z) }
const currentBlender = await import(sourceModule('', 'src/lib/blenderFlower.js'))

for (const [tone, commit] of Object.entries(sourceVersions)) {
  test(`${tone}: Blender peony retains approved near/far materials, geometry, and growth`, async () => {
    const original = await import(sourceModule(commit, 'src/lib/blenderFlower.js'))
    const actual = currentBlender.buildBlenderFlower(flower, assets, { tone })
    const expected = original.buildBlenderFlower(flower, assets, { tone })
    actual.userData.setOpen(0.62)
    expected.userData.setOpen(0.62)
    assert.equal(signature(actual), signature(expected), 'near model')
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100)
    camera.position.set(0, 3, 30)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()
    actual.userData.updateLOD(camera, 800, 0.8)
    expected.userData.updateLOD(camera, 800, 0.8)
    assert.equal(actual.userData.lod, 'far')
    assert.equal(signature(actual), signature(expected), 'far model')
    actual.userData.setLOD('near')
    assert.equal(actual.userData.lod, 'near')
    actual.userData.dispose()
    expected.userData.dispose()
  })
}

test('Blender theme variants isolate cached sources and release shared material leases safely', () => {
  const baseline = signature(near.scene)
  const first = currentBlender.buildBlenderFlower(flower, assets, { tone: 'balanced' })
  const second = currentBlender.buildBlenderFlower(flower, assets, { tone: 'balanced' })
  const other = currentBlender.buildBlenderFlower(flower, assets, { tone: 'aurora' })
  const materials = group => {
    const set = new Set()
    group.traverse(node => { if (node.material) set.add(node.material) })
    return set
  }
  const shared = materials(first)
  assert.deepEqual(materials(second), shared)
  assert.ok([...materials(other)].every(material => !shared.has(material)))
  let disposed = 0
  for (const material of shared) material.addEventListener('dispose', () => disposed++)
  first.userData.dispose()
  assert.equal(disposed, 0, 'another flower still owns the materials')
  second.userData.dispose()
  assert.equal(disposed, shared.size)
  second.userData.dispose()
  assert.equal(disposed, shared.size, 'disposal is idempotent')
  other.userData.dispose()
  assert.equal(signature(near.scene), baseline, 'shared cached model is untouched')
})

test('archived original and warm island models remain byte-for-byte intact', async () => {
  for (const [file, source] of [
    ['island.glb', '536d2ac:public/models/island.glb'],
    ['island-warm.glb', '536d2ac:public/models/island.glb'],
  ]) {
    assert.equal(hash(await readFile(new URL(`public/models/${file}`, root))),
      hash(execFileSync('git', ['show', source], { cwd: fileURLToPath(root) })))
  }
})

function readGlb(bytes) {
  const length = bytes.readUInt32LE(12)
  const json = JSON.parse(bytes.toString('utf8', 20, 20 + length))
  const bin = bytes.subarray(28 + length)
  const accessor = index => {
    const { bufferView, byteOffset = 0 } = json.accessors[index]
    const view = json.bufferViews[bufferView]
    const start = view.byteOffset ?? 0
    return bin.subarray(start + byteOffset, start + view.byteLength)
  }
  return { json, accessor }
}

function orientedTriangles(asset, index) {
  const { componentType, count } = asset.json.accessors[index]
  const size = { 5121: 1, 5123: 2, 5125: 4 }[componentType]
  const bytes = asset.accessor(index)
  return Array.from({ length: count / 3 }, (_, i) => {
    const face = [0, 1, 2].map(j => bytes.readUIntLE((i * 3 + j) * size, size))
    const first = face.indexOf(Math.min(...face))
    return [face[first], face[(first + 1) % 3], face[(first + 2) % 3]].join(',')
  }).sort()
}

test('retained island meshes preserve vertex data and faces, and the standalone fountain matches the island', async () => {
  const original = readGlb(execFileSync('git', ['show', '2af54a7:public/models/island.glb'], { cwd: fileURLToPath(root) }))
  const current = readGlb(await readFile(new URL('public/models/island-modern.glb', root)))
  const fountain = readGlb(await readFile(new URL('public/models/fountain.glb', root)))
  const retained = original.json.meshes.filter(mesh => !mesh.name.startsWith('Island_Peripheral_Crystals'))
  assert.equal(fountain.json.meshes.length, 4)
  assert.equal(fountain.json.materials.length, 3)
  assert.equal(current.json.meshes.length, retained.length + fountain.json.meshes.length)
  let fountainTriangles = 0
  for (const [asset, meshes] of [[original, retained], [fountain, fountain.json.meshes]]) {
    for (const mesh of meshes) {
      const embedded = current.json.meshes.find(candidate => candidate.name === mesh.name)
      assert.ok(embedded, mesh.name)
      assert.equal(embedded.primitives.length, 1, mesh.name)
      const [old] = mesh.primitives, [actual] = embedded.primitives
      assert.deepEqual(Object.keys(actual.attributes), Object.keys(old.attributes))
      for (const [attribute, index] of Object.entries(old.attributes)) {
        assert.ok(asset.accessor(index).equals(current.accessor(actual.attributes[attribute])), `${mesh.name} ${attribute}`)
      }
      assert.deepEqual(orientedTriangles(current, actual.indices), orientedTriangles(asset, old.indices), mesh.name)
      if (asset === fountain) fountainTriangles += asset.json.accessors[old.indices].count / 3
    }
  }
  assert.equal(fountainTriangles, 1486)
  const basin = fountain.json.meshes.find(mesh => mesh.name === 'Fountain_Basin')
  assert.equal(fountain.json.accessors[basin.primitives[0].attributes.POSITION].min[1], 0, 'standalone Y-up ground origin')
})
