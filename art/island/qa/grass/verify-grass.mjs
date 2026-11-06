// Geometry-only checks against the exported GLB; no renderer, texture decoding or network.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { createIslandGrass } from '../../../../src/lib/islandGrass.js'

const file = await readFile(new URL('../../../../public/models/island.glb', import.meta.url))
const originalJsonLength = file.readUInt32LE(12)
const json = JSON.parse(file.subarray(20, 20 + originalJsonLength).toString())
json.materials = [{ doubleSided: true }]
delete json.images
delete json.textures
delete json.samplers
for (const mesh of json.meshes) for (const primitive of mesh.primitives) primitive.material = 0
const jsonBytes = Buffer.from(JSON.stringify(json))
const paddedJson = Buffer.alloc(Math.ceil(jsonBytes.length / 4) * 4, 0x20)
jsonBytes.copy(paddedJson)
const header = Buffer.alloc(20)
header.writeUInt32LE(0x46546c67, 0)
header.writeUInt32LE(2, 4)
header.writeUInt32LE(20 + paddedJson.length + file.length - 20 - originalJsonLength, 8)
header.writeUInt32LE(paddedJson.length, 12)
header.writeUInt32LE(0x4e4f534a, 16)
const geometryGlb = Buffer.concat([header, paddedJson, file.subarray(20 + originalJsonLength)])
const data = geometryGlb.buffer.slice(geometryGlb.byteOffset, geometryGlb.byteOffset + geometryGlb.byteLength)
const { scene: model } = await new GLTFLoader().parseAsync(data, '')
const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3())
model.scale.setScalar(8 / Math.max(size.x, size.z))
model.position.y = 0.17
// Exercise actual parent translation and rotation as well as the app's GLB scale/offset.
const floating = new THREE.Group()
floating.position.set(0.4, 0.08, -0.3)
floating.rotation.y = 0.28
floating.add(model)
floating.updateMatrixWorld(true)
const started = performance.now()
const grass = createIslandGrass(model)
const placementMs = performance.now() - started
assert.ok(grass)
const { mesh } = grass
assert.equal(mesh.count, 1000)
assert.equal(mesh.geometry.index.count / 3, 6)
assert.equal(mesh.userData.triangles, 6000)
assert.equal(mesh.castShadow, false)
assert.equal(mesh.material.transparent, false)
assert.equal(mesh.material.opacity, 1)
assert.equal(mesh.material.roughness, 1)
assert.equal(mesh.material.metalness, 0)
assert.equal(mesh.parent, model)
assert.deepEqual(new THREE.Raycaster().intersectObject(mesh), [])
model.updateMatrixWorld(true)

const surfaces = [], crystals = []
model.traverse(object => {
  if (!object.isMesh) return
  if (/^Island_Surface/.test(object.name)) surfaces.push(object)
  if (/^Island_Peripheral_Crystals.*Cluster/.test(object.name)) crystals.push(new THREE.Box3().setFromObject(object))
})
const cast = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0))
const matrix = new THREE.Matrix4(), worldMatrix = new THREE.Matrix4()
const root = new THREE.Vector3(), vertex = new THREE.Vector3(), height = new THREE.Vector3()
let maxAnchorError = 0, minHeight = Infinity, maxHeight = 0
const regions = { left: 0, center: 0, right: 0 }
const roots = []
for (let i = 0; i < mesh.count; i++) {
  mesh.getMatrixAt(i, matrix)
  roots.push(new THREE.Vector3().setFromMatrixPosition(matrix))
  worldMatrix.multiplyMatrices(model.matrixWorld, matrix)
  root.setFromMatrixPosition(worldMatrix)
  cast.ray.origin.set(root.x, 3, root.z)
  const hit = cast.intersectObjects(surfaces, false)[0]
  assert.ok(hit, `root ${i} must lie over the planting surface`)
  maxAnchorError = Math.max(maxAnchorError, Math.abs(hit.point.y - root.y))
  height.setFromMatrixColumn(worldMatrix, 1)
  minHeight = Math.min(minHeight, height.length())
  maxHeight = Math.max(maxHeight, height.length())
  const localRoot = root.clone().applyMatrix4(floating.matrixWorld.clone().invert())
  regions[localRoot.x < -1 ? 'left' : localRoot.x > 1 ? 'right' : 'center']++
  for (let j = 0; j < mesh.geometry.attributes.position.count; j++) {
    vertex.fromBufferAttribute(mesh.geometry.attributes.position, j).applyMatrix4(worldMatrix)
    cast.ray.origin.set(vertex.x, 3, vertex.z)
    assert.ok(cast.intersectObjects(surfaces, false)[0], `tuft ${i} vertex ${j} outside ground / over pond`)
    assert.ok(!crystals.some(box => vertex.x >= box.min.x && vertex.x <= box.max.x && vertex.z >= box.min.z && vertex.z <= box.max.z), `tuft ${i} overlaps a crystal`)
  }
}
assert.ok(maxAnchorError < 0.00001)
assert.ok(minHeight >= 0.05999 && maxHeight <= 0.13001)
assert.ok(Object.values(regions).every(n => n > 180), 'coverage must include left, center and right')

const originalMatrices = mesh.instanceMatrix.array.slice()
const plantSpace = new THREE.Group()
plantSpace.position.y = 0.17
floating.add(plantSpace)
plantSpace.updateWorldMatrix(true, false)
const plantPosition = model.localToWorld(roots[0].clone())
plantSpace.worldToLocal(plantPosition)
grass.updatePlants([plantPosition], plantSpace)
mesh.getMatrixAt(0, matrix)
assert.ok(new THREE.Vector3().setFromMatrixColumn(matrix, 1).length() < 0.000001, 'grass under a stem must be suppressed')
assert.ok(new THREE.Vector3().setFromMatrixPosition(matrix).distanceTo(roots[0]) < 0.000001, 'shortening must not move roots')
const stemWorld = plantSpace.localToWorld(plantPosition.clone())
for (let i = 0; i < mesh.count; i++) {
  mesh.getMatrixAt(i, matrix)
  if (new THREE.Vector3().setFromMatrixColumn(matrix, 1).length() === 0) continue
  worldMatrix.multiplyMatrices(model.matrixWorld, matrix)
  for (let j = 0; j < mesh.geometry.attributes.position.count; j++) {
    vertex.fromBufferAttribute(mesh.geometry.attributes.position, j).applyMatrix4(worldMatrix)
    assert.ok(Math.hypot(vertex.x - stemWorld.x, vertex.z - stemWorld.z) >= 0.04,
      `spread blade ${i} must not reach into a stem`)
  }
}
grass.updatePlants([], plantSpace)
assert.deepEqual(mesh.instanceMatrix.array, originalMatrices, 'clearing plants restores grass without a rebuild')

const duplicate = createIslandGrass(model, { count: 9000 })
assert.equal(duplicate.mesh.count, 1000, 'hard budget must survive oversized requests')
assert.deepEqual(duplicate.mesh.instanceMatrix.array, originalMatrices, 'placement must be deterministic')
duplicate.dispose()
let geometryDisposals = 0, materialDisposals = 0
mesh.geometry.addEventListener('dispose', () => geometryDisposals++)
mesh.material.addEventListener('dispose', () => materialDisposals++)
grass.dispose()
grass.dispose()
assert.equal(mesh.parent, null)
assert.equal(geometryDisposals, 1)
assert.equal(materialDisposals, 1)
assert.equal(createIslandGrass(new THREE.Group()), null)
console.log(JSON.stringify({ status: 'passed', clumps: mesh.count, triangles: mesh.userData.triangles,
  materialCount: 1, mainDrawCalls: 1, shadowDrawCalls: 0, placementMs: +placementMs.toFixed(1),
  maxAnchorError, minHeight, maxHeight, regions,
  checks: ['actual transformed GLB anchoring', 'full tuft footprint on ground / outside pond',
    'crystal exclusion', 'hard triangle budget', 'stem clearance and restore', 'no picking', 'determinism', 'cleanup'],
}, null, 2))
