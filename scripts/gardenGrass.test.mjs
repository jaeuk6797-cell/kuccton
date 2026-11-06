import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { createIslandGrass } from '../src/lib/islandGrass.js'

async function model(file) {
  const bytes = await readFile(new URL(`../public/models/${file}`, import.meta.url))
  // This geometry/ownership test needs no browser image decoder; browser tests render the actual textures.
  const loader = new GLTFLoader().register(() => ({ name: 'test-texture-placeholder', loadTexture: () => Promise.resolve(new THREE.Texture()) }))
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
  const root = gltf.scene
  const bounds = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3())
  root.scale.setScalar(8 / Math.max(bounds.x, bounds.z))
  root.position.y = .17
  root.updateMatrixWorld(true)
  return root
}

for (const file of ['island.glb', 'island-modern.glb']) {
  test(`${file}: four grass palettes reuse geometry, instancing and material`, async () => {
    const first = await model(file)
    const controller = createIslandGrass(first, { tone: 'balanced' })
    assert.ok(controller)
    const { mesh } = controller
    assert.equal(mesh.count, 1000)
    assert.equal(mesh.userData.triangles, 6000)
    const geometry = mesh.geometry, material = mesh.material, instances = mesh.instanceMatrix
    const positions = Array.from(geometry.attributes.position.array)
    const originalMatrices = Array.from(instances.array)
    const palettes = new Set()
    for (const theme of ['balanced', 'warm', 'aurora', 'default']) {
      controller.setTheme(theme)
      assert.equal(controller.theme, theme)
      assert.equal(mesh.userData.grassTheme, theme)
      assert.equal(mesh.geometry, geometry)
      assert.equal(mesh.material, material)
      assert.equal(mesh.instanceMatrix, instances)
      assert.deepEqual(Array.from(geometry.attributes.position.array), positions)
      assert.deepEqual(Array.from(instances.array), originalMatrices)
      palettes.add(JSON.stringify(Array.from(geometry.attributes.color.array)))
    }
    assert.equal(palettes.size, 4, 'every theme has its own botanical palette')
    for (const bad of ['unknown', '__proto__', 'constructor', null]) {
      controller.setTheme(bad)
      assert.equal(controller.theme, 'balanced')
    }
    controller.updatePlants([new THREE.Vector3(0, 0, 0)], first)
    assert.equal(mesh.parent, first)
    assert.equal(mesh.count, 1000)
    controller.dispose()
    controller.dispose()
    assert.equal(mesh.parent, null)
  })
}

test('canonical island has 14,099 exported triangles and the approved decorations', async () => {
  const root = await model('island-modern.glb')
  const names = []
  let triangles = 0
  root.traverse(mesh => {
    if (!mesh.isMesh) return
    names.push(mesh.name)
    triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3
  })
  assert.equal(triangles, 14099)
  assert.ok(names.every(name => !/Ornamental_Ring|hoop/i.test(name)))
  for (const name of ['Island_Crystal_Underside', 'Island_Pond', 'Island_Metal_Rim', 'Island_Peripheral_Crystals']) {
    assert.ok(names.some(mesh => mesh.startsWith(name)), name)
  }
})
