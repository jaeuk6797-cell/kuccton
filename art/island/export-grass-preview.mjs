#!/usr/bin/env node
// Serialize the runtime grass as a Blender preview aid. Does not edit the GLB.
// Run after changing src/lib/islandGrass.js: node art/island/export-grass-preview.mjs
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const moduleUrl = new URL('../../src/lib/islandGrass.js', import.meta.url)
const glbUrl = new URL('../../public/models/island.glb', import.meta.url)
const outputUrl = new URL('./grass-preview.json', import.meta.url)
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const moduleHash = bytes => hash(bytes.toString('utf8').replace(/\r\n?/g, '\n'))
const [moduleBytes, glbBytes] = await Promise.all([readFile(moduleUrl), readFile(glbUrl)])
const moduleSha256 = moduleHash(moduleBytes), glbSha256 = hash(glbBytes)
const { createIslandGrass } = await import(`${moduleUrl.href}?sha256=${moduleSha256}`)

// Keep every geometry/accessor/node transform, but avoid image decoding and a WebGL
// context in Node. This modified copy exists only in memory and is never exported.
assert.equal(glbBytes.toString('ascii', 0, 4), 'glTF')
assert.equal(glbBytes.readUInt32LE(4), 2)
assert.equal(glbBytes.readUInt32LE(8), glbBytes.length)
assert.equal(glbBytes.readUInt32LE(16), 0x4e4f534a)
const originalJsonLength = glbBytes.readUInt32LE(12)
const json = JSON.parse(glbBytes.subarray(20, 20 + originalJsonLength).toString())
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
header.writeUInt32LE(20 + paddedJson.length + glbBytes.length - 20 - originalJsonLength, 8)
header.writeUInt32LE(paddedJson.length, 12)
header.writeUInt32LE(0x4e4f534a, 16)
const geometryGlb = Buffer.concat([header, paddedJson, glbBytes.subarray(20 + originalJsonLength)])
const data = geometryGlb.buffer.slice(geometryGlb.byteOffset, geometryGlb.byteOffset + geometryGlb.byteLength)
const { scene: model } = await new GLTFLoader().parseAsync(data, '')

// Match loadIslandGlb() in Island3D.jsx. The returned instance matrices already
// include the inverse of this transform, so do NOT apply it again in Blender.
const nativeSize = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3())
const modelScale = 8 / Math.max(nativeSize.x, nativeSize.z, 0.001)
model.scale.setScalar(modelScale)
model.position.y = 0.17
model.updateMatrixWorld(true)
let assetTriangles = 0
model.traverse(object => {
  if (object.isMesh) assetTriangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3
})
const grass = createIslandGrass(model)
assert.ok(grass, 'The GLB must contain the named planting surface')
grass.updatePlants([])
const { mesh } = grass
model.updateMatrixWorld(true)
const geometry = mesh.geometry, material = mesh.material
const trianglesPerInstance = (geometry.index?.count ?? geometry.attributes.position.count) / 3
const grassTriangles = trianglesPerInstance * mesh.count
assert.equal(mesh.count, 1000)
assert.equal(trianglesPerInstance, 6)
assert.equal(grassTriangles, 6000)
assert.equal(mesh.userData.triangles, grassTriangles)
assert.equal(material.transparent, false)
assert.equal(material.opacity, 1)
assert.ok(mesh.instanceColor)

const matrix = new THREE.Matrix4(), worldMatrix = new THREE.Matrix4(), height = new THREE.Vector3()
let minRuntimeHeight = Infinity, maxRuntimeHeight = 0
for (let i = 0; i < mesh.count; i++) {
  mesh.getMatrixAt(i, matrix)
  worldMatrix.multiplyMatrices(mesh.matrixWorld, matrix)
  height.setFromMatrixColumn(worldMatrix, 1)
  minRuntimeHeight = Math.min(minRuntimeHeight, height.length())
  maxRuntimeHeight = Math.max(maxRuntimeHeight, height.length())
}
mesh.computeBoundingBox()
const localBounds = mesh.boundingBox.clone().applyMatrix4(mesh.matrix)
const runtimeBounds = new THREE.Box3().setFromObject(mesh)
const bounds = box => ({ min: box.min.toArray(), max: box.max.toArray() })
const array = attribute => Array.from(attribute.array)
const payload = {
  schemaVersion: 1,
  previewOnly: true,
  excludeFromGltf: true,
  plantLayout: 'empty; runtime crop around planted flowers/trees is not baked',
  source: {
    modulePath: 'src/lib/islandGrass.js', moduleSha256,
    moduleHashNormalization: 'UTF-8 text with CRLF/CR normalized to LF',
    glbPath: 'public/models/island.glb', glbSha256,
    threeRevision: THREE.REVISION,
  },
  coordinates: {
    geometry: 'tuft-local, Y-up',
    instanceMatrices: 'instances[].matrix is column-major; maps tuft-local positions to unscaled GLB scene-local space',
    meshMatrix: 'column-major; apply after each instanceMatrix; currently identity',
    blenderMappingAfterTransforms: '(x, y, z) -> (x, -z, y)',
    colors: 'linear RGB; multiply geometry.colors, instances[].color and material.color once',
    normals: 'transform by inverse transpose of combined meshMatrix * instanceMatrix, normalize, then map axes',
    appTransformAlreadyInvertedByInstances: { scale: modelScale, translation: [0, 0.17, 0] },
  },
  name: mesh.name,
  count: mesh.count,
  geometry: {
    positions: array(geometry.attributes.position),
    normals: array(geometry.attributes.normal),
    colors: array(geometry.attributes.color),
    indices: geometry.index ? array(geometry.index) : Array.from({ length: geometry.attributes.position.count }, (_, i) => i),
  },
  meshMatrix: mesh.matrix.toArray(),
  instances: Array.from({ length: mesh.count }, (_, index) => ({
    matrix: Array.from(mesh.instanceMatrix.array.slice(index * 16, (index + 1) * 16)),
    color: Array.from(mesh.instanceColor.array.slice(index * 3, (index + 1) * 3)),
  })),
  material: {
    name: material.name, color: material.color.toArray(), vertexColors: material.vertexColors,
    roughness: material.roughness, metalness: material.metalness,
    envMapIntensity: material.envMapIntensity,
    doubleSided: material.side === THREE.DoubleSide,
    transparent: material.transparent, opacity: material.opacity,
  },
  rendering: { castShadow: mesh.castShadow, receiveShadow: mesh.receiveShadow },
  metrics: {
    verticesPerInstance: geometry.attributes.position.count, trianglesPerInstance,
    grassTriangles, assetTriangles, totalRuntimeTriangles: assetTriangles + grassTriangles,
    minRuntimeHeight, maxRuntimeHeight,
    gltfSceneLocalBounds: bounds(localBounds), runtimeBounds: bounds(runtimeBounds),
  },
}
assert.equal(payload.instances.length, payload.count)
assert.ok(payload.instances.every(instance => instance.matrix.length === 16 && instance.color.length === 3))
assert.ok([...payload.geometry.positions, ...payload.instances.flatMap(instance => [...instance.matrix, ...instance.color])].every(Number.isFinite))
// Refuse to publish a snapshot if another agent changed an input during generation.
const [latestModule, latestGlb] = await Promise.all([readFile(moduleUrl), readFile(glbUrl)])
assert.equal(moduleHash(latestModule), moduleSha256, 'Grass module changed during preview generation; rerun')
assert.equal(hash(latestGlb), glbSha256, 'GLB changed during preview generation; rerun')
await writeFile(outputUrl, JSON.stringify(payload, null, 2) + '\n')
grass.dispose()
console.log(JSON.stringify({ output: fileURLToPath(outputUrl), moduleSha256, glbSha256,
  count: payload.count, ...payload.metrics, previewOnly: true, excludeFromGltf: true }, null, 2))
