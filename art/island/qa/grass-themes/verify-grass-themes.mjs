import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { createIslandGrass } from '../../../../src/lib/islandGrass.js'

async function loadGeometry(filename) {
  const file = await readFile(new URL(`../../../../public/models/${filename}`, import.meta.url))
  const oldLength = file.readUInt32LE(12)
  const json = JSON.parse(file.subarray(20, 20 + oldLength).toString())
  json.materials = [{ doubleSided: true }]
  delete json.images
  delete json.textures
  delete json.samplers
  for (const mesh of json.meshes) for (const primitive of mesh.primitives) primitive.material = 0
  const jsonBytes = Buffer.from(JSON.stringify(json))
  const padded = Buffer.alloc(Math.ceil(jsonBytes.length / 4) * 4, 0x20)
  jsonBytes.copy(padded)
  const header = Buffer.alloc(20)
  header.writeUInt32LE(0x46546c67, 0)
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(20 + padded.length + file.length - 20 - oldLength, 8)
  header.writeUInt32LE(padded.length, 12)
  header.writeUInt32LE(0x4e4f534a, 16)
  const binary = Buffer.concat([header, padded, file.subarray(20 + oldLength)])
  const { scene: model } = await new GLTFLoader().parseAsync(binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength), '')
  const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3())
  model.scale.setScalar(8 / Math.max(size.x, size.z))
  model.position.y = 0.17
  model.updateMatrixWorld(true)
  return model
}

const model = await loadGeometry('island.glb')
const grass = createIslandGrass(model)
const { mesh } = grass
assert.equal(grass.theme, 'balanced')
assert.equal(mesh.userData.grassTheme, 'balanced')
assert.equal(mesh.count, 1000)
assert.equal(mesh.geometry.index.count * mesh.count / 3, 6000)

// Compare the approved committed layout, not just two instances of the new code.
const priorSource = execFileSync('git', ['show', '6da2b6f:src/lib/islandGrass.js'], { encoding: 'utf8' })
const threeUrl = new URL('../../../../node_modules/three/build/three.module.js', import.meta.url).href
const priorModule = await import(`data:text/javascript;base64,${Buffer.from(priorSource.replace("from 'three'", `from '${threeUrl}'`)).toString('base64')}`)
const prior = priorModule.createIslandGrass(model)
assert.deepEqual(mesh.instanceMatrix.array, prior.mesh.instanceMatrix.array, 'approved modern placement must not move')
assert.deepEqual(mesh.instanceColor.array, prior.mesh.instanceColor.array, 'instance variations must remain identical')
assert.deepEqual(mesh.geometry.attributes.position.array, prior.mesh.geometry.attributes.position.array)
assert.deepEqual(mesh.geometry.index.array, prior.mesh.geometry.index.array)
prior.dispose()

const geometry = mesh.geometry, material = mesh.material
const vertices = geometry.attributes.position, colors = geometry.attributes.color
const instances = mesh.instanceMatrix, variations = mesh.instanceColor
const vertexBuffer = vertices.array, colorBuffer = colors.array, instanceBuffer = instances.array
const indexBuffer = geometry.index.array
const originalMatrices = instanceBuffer.slice()
const originalVertices = vertexBuffer.slice()
const originalVariations = variations.array.slice()
const originalVersion = material.version
const snapshots = {}
for (const theme of ['balanced', 'warm', 'aurora', 'default', 'warm', 'balanced', 'aurora', 'default']) {
  assert.equal(grass.setTheme(theme), theme)
  assert.equal(grass.theme, theme)
  assert.equal(mesh.userData.grassTheme, theme)
  assert.equal(mesh.geometry, geometry)
  assert.equal(mesh.material, material)
  assert.equal(mesh.instanceMatrix, instances)
  assert.equal(mesh.instanceColor, variations)
  assert.equal(vertices.array, vertexBuffer)
  assert.equal(colors.array, colorBuffer)
  assert.equal(instances.array, instanceBuffer)
  assert.equal(geometry.index.array, indexBuffer)
  assert.deepEqual(vertexBuffer, originalVertices)
  assert.deepEqual(instanceBuffer, originalMatrices)
  assert.deepEqual(variations.array, originalVariations)
  assert.equal(material.version, originalVersion, 'theme uniforms must not request shader recompilation')
  assert.equal(material.transparent, false)
  assert.equal(material.opacity, 1)
  assert.equal(material.metalness, 0)
  assert.ok(material.roughness >= 0.95)
  assert.equal(material.emissive.getHex(), 0)
  const palette = [0, 2, 4].map(i => {
    const color = new THREE.Color().fromBufferAttribute(colors, i).multiply(material.color)
    assert.ok(color.g > color.r && color.g > color.b, `${theme} must remain green rather than pink or blue`)
    return `#${color.getHexString()}`
  })
  snapshots[theme] = { palette, roughness: material.roughness, envMapIntensity: material.envMapIntensity }
}
assert.equal(new Set(Object.values(snapshots).map(s => s.palette.join(','))).size, 4)
for (const unknown of ['unknown', 'constructor', '__proto__', null, undefined]) {
  assert.equal(grass.setTheme(unknown), 'balanced')
  assert.equal(mesh.userData.grassTheme, 'balanced')
}
const matrix = new THREE.Matrix4()
mesh.getMatrixAt(0, matrix)
const plant = new THREE.Vector3().setFromMatrixPosition(matrix)
grass.updatePlants([plant], model)
const cropped = instances.array.slice()
assert.notDeepEqual(cropped, originalMatrices)
for (const theme of ['warm', 'aurora', 'default', 'balanced']) {
  grass.setTheme(theme)
  assert.deepEqual(instances.array, cropped, 'theme switching must preserve active stem clearance')
}
grass.updatePlants([], model)
assert.deepEqual(instances.array, originalMatrices)

for (const [options, expected] of [
  [{ tone: 'warm' }, 'warm'], [{ theme: 'aurora', tone: 'warm' }, 'aurora'],
  [{ theme: 'invalid', tone: 'warm' }, 'balanced'], [{ tone: 'invalid' }, 'balanced'],
]) {
  const other = createIslandGrass(model, options)
  assert.equal(other.theme, expected)
  assert.deepEqual(other.mesh.instanceMatrix.array, originalMatrices)
  other.dispose()
}

assert.throws(() => grass.reparent(null), TypeError)
assert.throws(() => grass.reparent(mesh), TypeError)
const uuid = mesh.uuid
mesh.removeFromParent()
const relocated = model.clone(true)
relocated.position.set(0.3, 0.5, -0.8)
relocated.rotation.y = 0.48
relocated.scale.multiplyScalar(1.12)
const parent = new THREE.Group()
parent.position.set(-0.7, 0.2, 0.4)
parent.rotation.y = -0.21
parent.add(relocated)
grass.reparent(relocated)
assert.equal(mesh.parent, relocated)
assert.equal(mesh.uuid, uuid)
assert.equal(mesh.geometry, geometry)
assert.equal(mesh.material, material)
assert.equal(mesh.instanceMatrix, instances)
assert.deepEqual(instances.array, originalMatrices)
const plantSpace = new THREE.Group()
plantSpace.position.set(0.4, -0.2, 0.8)
plantSpace.rotation.y = 0.71
plantSpace.updateWorldMatrix(true, false)
const movedPlant = relocated.localToWorld(plant.clone())
plantSpace.worldToLocal(movedPlant)
grass.updatePlants([movedPlant], plantSpace)
mesh.getMatrixAt(0, matrix)
assert.ok(new THREE.Vector3().setFromMatrixColumn(matrix, 1).length() < 1e-7,
  'reparented clearance must follow the new model transform')
for (let i = 0; i < cropped.length; i++) assert.ok(Math.abs(instances.array[i] - cropped[i]) < 1e-6)
grass.setTheme('aurora')
const movedCropped = instances.array.slice()
grass.setTheme('warm')
assert.deepEqual(instances.array, movedCropped)
grass.updatePlants([], relocated)
assert.deepEqual(instances.array, originalMatrices)

const archived = await loadGeometry('island-warm.glb')
const warm = createIslandGrass(archived, { tone: 'warm' })
assert.equal(warm.mesh.count, 1000)
const surfaces = [], feet = []
archived.traverse(object => {
  if (!object.isMesh) return
  if (/^Island_Surface/.test(object.name)) surfaces.push(object)
  if (/^Island_Ornamental_Ring.*feet/i.test(object.name)) feet.push(new THREE.Box3().setFromObject(object))
})
assert.ok(feet.length, 'archived hoop feet must be present in this test')
const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0))
const vertex = new THREE.Vector3(), world = new THREE.Matrix4()
const triangle = new THREE.Triangle()
let footIntersections = 0
for (let i = 0; i < warm.mesh.count; i++) {
  warm.mesh.getMatrixAt(i, matrix)
  world.multiplyMatrices(archived.matrixWorld, matrix)
  const attribute = warm.mesh.geometry.attributes.position
  const index = warm.mesh.geometry.index
  for (let j = 0; j < attribute.count; j++) {
    vertex.fromBufferAttribute(attribute, j).applyMatrix4(world)
    ray.ray.origin.set(vertex.x, 3, vertex.z)
    assert.ok(ray.intersectObjects(surfaces, false).length, 'archived grass must stay on the actual surface / outside pond')
  }
  for (let j = 0; j < index.count; j += 3) {
    triangle.a.fromBufferAttribute(attribute, index.getX(j)).applyMatrix4(world)
    triangle.b.fromBufferAttribute(attribute, index.getX(j + 1)).applyMatrix4(world)
    triangle.c.fromBufferAttribute(attribute, index.getX(j + 2)).applyMatrix4(world)
    if (feet.some(box => box.intersectsTriangle(triangle))) footIntersections++
  }
}
const colorVersion = colors.version
assert.equal(footIntersections, 0, 'archived hoop feet must not intersect grass')
let geometryDisposals = 0, materialDisposals = 0
geometry.addEventListener('dispose', () => geometryDisposals++)
material.addEventListener('dispose', () => materialDisposals++)
grass.dispose()
assert.throws(() => grass.reparent(relocated), /disposed/)
grass.setTheme('aurora')
grass.dispose()
assert.equal(colors.version, colorVersion)
assert.equal(geometryDisposals, 1)
assert.equal(materialDisposals, 1)
warm.dispose()
console.log(JSON.stringify({ status: 'passed', clumps: mesh.count, triangles: 6000,
  sourceSha256Lf: createHash('sha256').update((await readFile(new URL('../../../../src/lib/islandGrass.js', import.meta.url), 'utf8')).replace(/\r\n/g, '\n')).digest('hex'),
  themes: snapshots, archivedFootTriangleIntersections: footIntersections,
  checks: ['approved modern geometry and placement unchanged', 'all resources and buffers reused',
    'four distinct green palettes', 'no material recompile flag', 'fallback and tone alias',
    'stem cropping preserved', 'reparented buffers and transformed clearance',
    'archived surface, pond and hoop feet', 'idempotent disposal'],
}, null, 2))
