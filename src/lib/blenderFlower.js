import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { flowerParams, toColor } from './flower3d.js'
import { applyAuroraFloraRim, floraColor, getFloraPalette } from './crystalFlora.js'

const MODEL_PATH = `${import.meta.env.BASE_URL}models/flora/`
const PETAL_PIVOTS = ['Outer_Petal_Pivot', 'Middle_Petal_Pivot', 'Inner_Petal_Pivot']
// Projected bloom width in CSS pixels. The gap keeps small zoom/orbit changes from flipping LODs.
const NEAR_WIDTH = 46
const FAR_WIDTH = 36
const materialVariants = new Map()
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

function createVariant(source, tint, tone, opal) {
  const material = source.clone()
  if (opal) material.color.multiply(tint)
  if (tone === 'warm' && source.name === '03 | Champagne crystal') {
    material.color.multiply(new THREE.Color('#ffe9df'))
  }
  if (tone === 'warm' && source.name === '02 | Aqua mineral') {
    // Preserve the exported cuts and their tonal variation, warming only the baked color.
    const previousCompile = source.onBeforeCompile
    material.onBeforeCompile = function (shader, renderer) {
      previousCompile.call(this, shader, renderer)
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
        #include <color_fragment>
        float mineralValue = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        diffuseColor.rgb = mix(diffuseColor.rgb, mineralValue * vec3(1.30, 0.86, 0.82), 0.72);
      `)
    }
    material.customProgramCacheKey = () => 'sup-warm-flora-mineral-v1'
  }
  if (tone === 'balanced') {
    if (opal) {
      material.roughness = 0.29
      material.metalness = 0.13
      material.clearcoat = 0.25
      const pearl = getFloraPalette(tone).pearl.clone()
      const previousCompile = source.onBeforeCompile
      material.onBeforeCompile = function (shader, renderer) {
        previousCompile.call(this, shader, renderer)
        shader.uniforms.balancedPetalPearl = { value: pearl }
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform vec3 balancedPetalPearl;')
          .replace('#include <color_fragment>', `
            #include <color_fragment>
            // The export paints pink into every bloom. Retain its cut shading,
            // while the live material diffuse color supplies the flower's own hue.
            #if defined(USE_COLOR) || defined(USE_COLOR_ALPHA)
              float opalFacetValue = dot(vColor.rgb, vec3(0.2126, 0.7152, 0.0722));
            #else
              float opalFacetValue = 0.62;
            #endif
            float opalFacetShade = clamp(opalFacetValue / 0.62, 0.50, 1.22);
            float opalPearlHighlight = smoothstep(0.65, 0.84, opalFacetValue) * 0.22;
            diffuseColor.rgb = mix(diffuse, balancedPetalPearl, opalPearlHighlight) * opalFacetShade;
          `)
      }
      material.customProgramCacheKey = () => 'sup-balanced-flora-opal-v1'
    } else if (source.name === '03 | Champagne crystal') {
      material.color.multiply(new THREE.Color('#fff0dc'))
    } else if (source.name === '02 | Aqua mineral') {
      const palette = getFloraPalette(tone)
      const shadowGreen = new THREE.Color(palette.darkGreen)
      const leafGreen = new THREE.Color(palette.leaf)
      const previousCompile = source.onBeforeCompile
      material.roughness = 0.43
      material.metalness = 0.08
      material.clearcoat = 0.18
      material.iridescence = 0.08
      material.onBeforeCompile = function (shader, renderer) {
        previousCompile.call(this, shader, renderer)
        shader.uniforms.balancedShadowGreen = { value: shadowGreen }
        shader.uniforms.balancedLeafGreen = { value: leafGreen }
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform vec3 balancedShadowGreen;\nuniform vec3 balancedLeafGreen;')
          .replace('#include <color_fragment>', `
            #include <color_fragment>
            float mineralValue = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
            diffuseColor.rgb = mix(balancedShadowGreen, balancedLeafGreen,
              smoothstep(0.04, 0.55, mineralValue)) * (0.70 + 0.50 * mineralValue);
          `)
      }
      material.customProgramCacheKey = () => 'sup-balanced-flora-green-v1'
    }
  }
  if (tone === 'aurora') {
    if (opal) {
      material.metalness = 0.12
      material.roughness = 0.28
      material.clearcoat = 0.28
      material.iridescence = 0.32
      applyAuroraFloraRim(material, { strength: 0.5 })
    } else if (source.name === '03 | Champagne crystal') {
      material.emissive.set('#ffd692')
      material.emissiveIntensity = 0.48
    } else if (source.name === '02 | Aqua mineral') {
      material.metalness = 0.10
      material.roughness = 0.32
      material.clearcoat = 0.24
      const previousCompile = source.onBeforeCompile
      material.onBeforeCompile = function (shader, renderer) {
        previousCompile.call(this, shader, renderer)
        shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
          #include <color_fragment>
          float mineralValue = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          mineralValue += 0.06 * (1.0 - mineralValue);
          diffuseColor.rgb = mix(diffuseColor.rgb, mineralValue * vec3(0.34, 1.18, 1.26), 0.72);
        `)
      }
      material.customProgramCacheKey = () => 'sup-aurora-flora-mineral-v2'
      applyAuroraFloraRim(material, { strength: 0.36 })
    }
  }
  return material
}

function acquireMaterial(source, tint, tone, opal, release) {
  const key = `${source.uuid}:${tone}:${opal ? tint.getHex() : 'mineral'}`
  let variant = materialVariants.get(key)
  if (!variant) {
    const material = createVariant(source, tint, tone, opal)
    variant = { material, users: 0 }
    materialVariants.set(key, variant)
  }
  variant.users++
  release.push(() => {
    if (--variant.users > 0) return
    materialVariants.delete(key)
    variant.material.dispose()
  })
  return variant.material
}

export function buildBlenderFlower(flower, assets, { dimmed = false, detail = false, tone = 'balanced' } = {}) {
  const root = new THREE.Group()
  const { near, far, height, width } = assets
  const scale = (0.55 + 0.25 * flowerParams(flower).size) / height
  const tint = tone === 'default'
    ? new THREE.Color('white').lerp(toColor(flower.color), 0.34)
    : tone === 'balanced' ? floraColor(toColor(flower.color), tone)
      : getFloraPalette(tone).pearl.clone().lerp(floraColor(toColor(flower.color), tone), tone === 'aurora' ? 0.78 : 0.28)
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
          material = createVariant(source, tint, tone, source === opal)
          release.push(() => material.dispose())
        } else if (source === opal || tone !== 'default') {
          material = acquireMaterial(source, tint, tone, source === opal, release)
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

  // Carry the hysteresis decision across a theme-only visual replacement.
  root.userData.setLOD = lod => {
    const next = lod === 'far' && distant ? distant : hero
    if (active !== next) {
      root.remove(active.scene)
      root.add(next.scene)
      active = next
    }
    root.userData.lod = active === hero ? 'near' : 'far'
    firstLOD = false
  }

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
