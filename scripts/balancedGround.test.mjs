import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import * as toneHelpers from '../src/lib/islandTone.js'
import { BALANCED_GRASS_MIDTONE } from '../src/lib/islandGrass.js'
import { applyAuroraGroundGrain } from '../src/lib/auroraGround.js'

const normalize = text => text.replaceAll('\r\n', '\n')
const baseline = path => normalize(execFileSync('git', ['show', `d5b12a3:${path}`], { encoding: 'utf8' }))
const component = normalize(await readFile(new URL('../src/components/Island3D.jsx', import.meta.url), 'utf8'))
const baselineTone = baseline('src/lib/islandTone.js').replace(/^import .*$/gm, '').replaceAll('export function ', 'function ')
const oldHelpers = new Function('THREE', `${baselineTone}; return {
  applyWarmIslandMaterial, applyWarmIslandPaint, applyAuroraIslandMaterial, applyAuroraIslandPaint,
};`)(THREE)
function appearanceFactory(source, helpers) {
  const reflection = source.slice(source.indexOf('function applyOpalReflection('), source.indexOf('function jitter('))
  const start = source.indexOf('function prepareIslandAppearance(')
  const appearance = source.slice(start, source.indexOf('\n// ─', start))
  return new Function('THREE', 'applyAuroraGroundGrain', ...Object.keys(helpers),
    `${reflection}\n${appearance}\nreturn prepareIslandAppearance;`)(THREE, applyAuroraGroundGrain, ...Object.values(helpers))
}
const prepare = appearanceFactory(component, toneHelpers)
const prepareOld = appearanceFactory(baseline('src/components/Island3D.jsx'), oldHelpers)
const bytes = await readFile(new URL('../public/models/island-modern.glb', import.meta.url))
const loader = new GLTFLoader().register(() => ({
  name: 'test-texture-placeholder', loadTexture: () => Promise.resolve(new THREE.Texture()),
}))
const { scene: authored } = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
function copyModel() {
  const model = authored.clone(true)
  // Keep the real shared material/texture relationships; paint arrays must be independent.
  model.traverse(mesh => { if (mesh.isMesh) mesh.geometry = mesh.geometry.clone() })
  return model
}
const meshes = model => {
  const result = []
  model.traverse(mesh => { if (mesh.isMesh) result.push(mesh) })
  return result
}
const findSurface = model => meshes(model).find(mesh => /^Island_Surface/.test(mesh.name))
const findBasin = model => meshes(model).find(mesh => /^Island_Pond/.test(mesh.name) && mesh.material.name === 'SUP Opalescent ground')
const arrayHash = array => createHash('sha256').update(Buffer.from(array.buffer, array.byteOffset, array.byteLength)).digest('hex')
function materialSignature(material) {
  const json = material.toJSON()
  delete json.uuid
  delete json.metadata
  const shader = {
    uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>',
    fragmentShader: '#include <common>\n#include <color_fragment>\n#include <aomap_fragment>\n#include <emissivemap_fragment>\n#include <opaque_fragment>',
  }
  material.onBeforeCompile(shader, null)
  return { json, shader, programKey: material.customProgramCacheKey() }
}
function meshSignature(mesh) {
  return {
    name: mesh.name,
    attributes: Object.fromEntries(Object.entries(mesh.geometry.attributes).map(([name, attr]) => [name, arrayHash(attr.array)])),
    index: arrayHash(mesh.geometry.index.array), material: materialSignature(mesh.material),
  }
}

test('Balanced isolates the actual planting surface from its shared pond material', () => {
  const model = copyModel(), reference = copyModel()
  const ground = findSurface(model), pond = findBasin(model)
  assert.ok(ground && pond)
  assert.equal(ground.material, pond.material, 'actual GLB must exercise the shared-source hazard')
  assert.notEqual(ground.geometry.attributes.color, pond.geometry.attributes.color)
  const source = ground.material
  const sourceSignature = materialSignature(source)
  const originalColor = ground.geometry.attributes.color.array.slice()
  const geometry = ground.geometry
  const originalAttributes = Object.fromEntries(Object.entries(geometry.attributes).map(([name, attr]) => [name, arrayHash(attr.array)]))
  const originalMaterialCount = new Set(meshes(model).map(mesh => mesh.material)).size
  const controller = prepare(model), old = prepareOld(reference)
  controller.setTone('balanced')
  old.setTone('balanced')
  assert.notEqual(ground.material, pond.material)
  assert.equal(ground.material.color.getHex(), BALANCED_GRASS_MIDTONE)
  assert.equal(BALANCED_GRASS_MIDTONE, 0x91bd92)
  assert.ok(ground.material.roughness >= 0.85 && ground.material.roughness <= 0.95)
  assert.equal(ground.material.metalness, 0)
  assert.equal(ground.material.clearcoat, 0)
  assert.equal(ground.material.iridescence, 0)
  assert.equal(ground.material.opacity, source.opacity)
  assert.equal(ground.material.transparent, source.transparent)
  assert.equal(ground.material.transmission, source.transmission)
  assert.equal(ground.material.userData.opalReflection, undefined)
  assert.equal(ground.material.onBeforeCompile, source.onBeforeCompile, 'ground adds no shader hook')
  for (const key of Object.keys(source)) if (source[key]?.isTexture) assert.equal(ground.material[key], source[key], key)
  const currentMeshes = meshes(model), referenceMeshes = meshes(reference)
  for (let i = 0; i < currentMeshes.length; i++) {
    if (currentMeshes[i] === ground || currentMeshes[i].name.startsWith('Fountain_')) continue
    assert.deepEqual(meshSignature(currentMeshes[i]), meshSignature(referenceMeshes[i]), currentMeshes[i].name)
  }
  const colors = geometry.attributes.color
  const shades = new Set()
  for (let i = 0; i < colors.count; i++) {
    assert.equal(colors.getX(i), colors.getY(i))
    assert.equal(colors.getY(i), colors.getZ(i))
    assert.ok(colors.getX(i) >= 0.95999 && colors.getX(i) <= 1.04001)
    if (colors.itemSize === 4) assert.equal(colors.getW(i), originalColor[i * 4 + 3])
    shades.add(colors.getX(i))
  }
  assert.ok(shades.size > 1, 'retain gentle authored tonal variation')
  assert.equal(ground.geometry, geometry)
  for (const [name, attr] of Object.entries(geometry.attributes)) {
    if (name !== 'color') assert.equal(arrayHash(attr.array), originalAttributes[name])
  }
  assert.equal(new Set(currentMeshes.map(mesh => mesh.material)).size, originalMaterialCount + 1)
  assert.equal(currentMeshes.reduce((sum, mesh) => sum + mesh.geometry.index.count / 3, 0), 14025)
  assert.deepEqual(materialSignature(source), sourceSignature, 'authored shared material remains untouched')
  controller.dispose()
  old.dispose()
  assert.equal(ground.material, source)
  assert.equal(pond.material, source)
})

test('Warm, Aurora and Default retain the original island materials, shaders and vertex colors through cycles', () => {
  const model = copyModel(), reference = copyModel()
  const controller = prepare(model), old = prepareOld(reference)
  const ground = findSurface(model), pond = findBasin(model)
  const originals = new Map(meshes(model).map(mesh => [mesh.geometry.attributes.color,
    mesh.geometry.attributes.color?.array.slice()]))
  const cached = new Map()
  let balancedColors
  for (const tone of ['balanced', 'warm', 'balanced', 'default', 'balanced', 'aurora', 'warm', 'balanced', 'aurora', 'default', 'warm', 'balanced']) {
    controller.setTone(tone)
    old.setTone(tone)
    const list = meshes(model)
    if (cached.has(tone)) assert.deepEqual(list.map(mesh => mesh.material), cached.get(tone), `${tone} cache is stable`)
    else cached.set(tone, list.map(mesh => mesh.material))
    if (tone === 'balanced') {
      assert.notEqual(ground.material, pond.material)
      if (balancedColors) assert.deepEqual(ground.geometry.attributes.color.array, balancedColors)
      else balancedColors = ground.geometry.attributes.color.array.slice()
    } else {
      assert.equal(ground.material, pond.material, `${tone} retains original material sharing`)
      const oldList = meshes(reference)
      list.forEach((mesh, i) => {
        if (!mesh.name.startsWith('Fountain_')) assert.deepEqual(meshSignature(mesh), meshSignature(oldList[i]), `${tone}: ${mesh.name}`)
      })
    }
    for (const [colors, original] of originals) {
      if (!colors || colors.itemSize !== 4) continue
      for (let i = 0; i < colors.count; i++) assert.equal(colors.array[i * 4 + 3], original[i * 4 + 3])
    }
  }
  const variants = new Set([...cached.values()].flat())
  let disposals = 0
  for (const material of variants) material.addEventListener('dispose', () => disposals++)
  controller.dispose()
  old.dispose()
  assert.equal(disposals, variants.size, 'dispose every cached clone, including separate Balanced ground')
})
