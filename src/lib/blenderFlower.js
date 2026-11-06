import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { flowerParams, toColor } from './flower3d.js'

const MODEL_PATH = `${import.meta.env.BASE_URL}models/flora/`
const PETAL_PIVOTS = ['Outer_Petal_Pivot', 'Middle_Petal_Pivot', 'Inner_Petal_Pivot']
// Projected bloom width in CSS pixels. The gap keeps small zoom/orbit changes from flipping LODs.
const NEAR_WIDTH = 46
const FAR_WIDTH = 36
const opalVariants = new Map()
let cached
let pending

async function loadLevel(loader, suffix) {
  const file = `crystal_flower${suffix ? '_lod' : ''}.glb`
  try {
    const { scene } = await loader.loadAsync(MODEL_PATH + file)
    const bloom = scene.getObjectByName('Bloom_Pivot' + suffix)
    if (!bloom || ![...PETAL_PIVOTS, 'Champagne_heart'].every(name => bloom.getObjectByName(name + suffix)?.isMesh)) {
      throw new Error('Crystal flower is missing its exported bloom meshes')
    }
    return { scene, suffix }
  } catch (error) {
    console.warn(`Could not load ${file}`, error)
    return null
  }
}

function loadAssets() {
  if (!pending) {
    const loader = new GLTFLoader()
    pending = Promise.all([loadLevel(loader, ''), loadLevel(loader, '_LOD')]).then(([near, far]) => {
      if (!near) return null
      const bounds = new THREE.Box3().setFromObject(near.scene).getSize(new THREE.Vector3())
      return (cached = { near, far, height: bounds.y, width: Math.max(bounds.x, bounds.z) })
    })
  }
  return pending
}

export function useBlenderFlowerAssets(enabled) {
  const [assets, setAssets] = useState(cached)
  useEffect(() => {
    if (!enabled || cached) return
    let active = true
    loadAssets().then(value => { if (active) setAssets(value) })
    return () => { active = false }
  }, [enabled])
  return enabled ? cached || assets : null
}

function acquireOpal(source, tint, release) {
  const key = tint.getHex()
  let variant = opalVariants.get(key)
  if (!variant) {
    const material = source.clone()
    material.color.multiply(tint)
    variant = { material, users: 0 }
    opalVariants.set(key, variant)
  }
  variant.users++
  release.push(() => {
    if (--variant.users > 0) return
    opalVariants.delete(key)
    variant.material.dispose()
  })
  return variant.material
}

export function buildBlenderFlower(flower, assets, { dimmed = false, detail = false } = {}) {
  const root = new THREE.Group()
  const { near, far, height, width } = assets
  const scale = (0.55 + 0.25 * flowerParams(flower).size) / height
  const tint = new THREE.Color('white').lerp(toColor(flower.color), 0.34)
  const materials = new Map()
  const release = []

  function instance(level) {
    const scene = level.scene.clone(true)
    scene.scale.setScalar(scale)
    const bloom = scene.getObjectByName('Bloom_Pivot' + level.suffix)
    const petals = PETAL_PIVOTS.map(name => bloom.getObjectByName(name + level.suffix))
    const heart = bloom.getObjectByName('Champagne_heart' + level.suffix)
    const opal = petals[0].material
    scene.traverse(obj => {
      if (!obj.isMesh) return
      const source = obj.material
      if (!materials.has(source.name)) {
        let material = source
        if (dimmed) {
          material = source.clone()
          if (source === opal) material.color.multiply(tint)
          release.push(() => material.dispose())
        } else if (source === opal) {
          material = acquireOpal(source, tint, release)
        }
        materials.set(source.name, material)
      }
      obj.material = materials.get(source.name)
      obj.castShadow = !dimmed
    })
    return { scene, bloom, petals, heart, heartY: heart.position.y }
  }

  const hero = instance(near)
  const distant = far && !detail ? instance(far) : null
  const levels = distant ? [hero, distant] : [hero]
  let active = hero
  let firstLOD = true
  const viewPosition = new THREE.Vector3()
  root.add(hero.scene)
  root.userData.headY = hero.bloom.position.y * scale
  root.userData.blender = true
  root.userData.lod = 'near'
  root.userData.setOpen = progress => {
    for (const { petals, heart, heartY } of levels) {
      petals.forEach((petal, i) => {
        const delay = i * 0.1
        const t = THREE.MathUtils.clamp((progress - delay) / (1 - delay), 0, 1)
        const open = t * t * (3 - 2 * t)
        const radius = THREE.MathUtils.lerp(0.34 + i * 0.12, 1, open)
        // Each ring is a single mesh. Compress it at its own pivot around the calyx.
        petal.scale.set(radius, THREE.MathUtils.lerp(1.05 - i * 0.07, 1, open), radius)
      })
      const open = THREE.MathUtils.smoothstep(progress, 0.25, 0.9)
      heart.scale.setScalar(0.48 + 0.52 * open)
      heart.position.y = heartY - 0.035 * (1 - open)
    }
  }
  root.userData.setOpen(0)

  if (distant) root.userData.updateLOD = (camera, viewportHeight, plantScale) => {
    root.getWorldPosition(viewPosition).applyMatrix4(camera.matrixWorldInverse)
    const pixels = width * scale * plantScale * camera.projectionMatrix.elements[5] * viewportHeight / (-2 * viewPosition.z)
    const threshold = firstLOD ? (NEAR_WIDTH + FAR_WIDTH) / 2 : active === hero ? FAR_WIDTH : NEAR_WIDTH
    const next = pixels >= threshold ? hero : distant
    firstLOD = false
    if (next === active) return
    // Raycasting and shadow passes see the active level only. Both levels already have the same pose.
    root.remove(active.scene)
    root.add(next.scene)
    active = next
    root.userData.lod = active === hero ? 'near' : 'far'
  }

  // Geometry and untouched materials belong to the asset cache. Only instance leases end here.
  root.userData.dispose = () => release.splice(0).forEach(dispose => dispose())
  return root
}
