import * as THREE from 'three'

const FOUNTAIN_COLORS = {
  balanced: ['#f1e7d5', '#c5a382', '#a3d8de'],
  warm: ['#f5e2da', '#d3a191', '#d1d5e1'],
  aurora: ['#c6b6e4', '#b89bc8', '#62d7df'],
  default: ['#e0e7ef', '#b7aecf', '#a1d4e3'],
}
const FOUNTAIN_MATERIALS = ['SUP Fountain porcelain', 'SUP Fountain champagne', 'SUP Fountain water']

export function applyFountainMaterial(material, tone) {
  const index = FOUNTAIN_MATERIALS.indexOf(material.name)
  if (index === -1) return
  material.color.set(FOUNTAIN_COLORS[tone][index])
  if (index === 2 && tone === 'aurora') {
    material.emissive.set('#69cadf')
    material.emissiveIntensity = .18
  }
}

export function applyBalancedGroundMaterial(material) {
  material.color.set('#91bd92')
  material.vertexColors = false
  material.roughness = .91
  material.metalness = 0
  material.clearcoat = 0
  material.iridescence = 0
  material.specularIntensity = .38
  material.envMapIntensity = .25
  material.normalScale?.setScalar(.10)
}

const FACET_TINTS = {
  'SUP Lavender quartz': ['#d7afd4', 0.62],
  'SUP Cyan quartz': ['#efd5b7', 0.76],
  'SUP Pink opal': ['#efb8c9', 0.60],
  'SUP Iridescent foliage': ['#d9c0c8', 0.65],
}

// Recolor the imported paint once. Positions, normals, UVs and facet alpha stay intact.
export function applyWarmIslandPaint(colors, materialName) {
  const tint = FACET_TINTS[materialName]
  if (!tint) return
  const target = new THREE.Color(tint[0])
  const targetBrightness = Math.max(target.r, target.g, target.b)
  const scaledTarget = new THREE.Color()
  const color = new THREE.Color()
  for (let i = 0; i < colors.count; i++) {
    color.setRGB(colors.getX(i), colors.getY(i), colors.getZ(i))
    const brightness = Math.max(color.r, color.g, color.b)
    color.lerp(scaledTarget.copy(target).multiplyScalar(brightness / targetBrightness), tint[1])
    colors.setXYZ(i, color.r, color.g, color.b)
  }
}

export function applyWarmIslandMaterial(material) {
  if (material.userData.warmTone) return
  material.userData.warmTone = true
  switch (material.name) {
    case 'SUP Opalescent ground':
      material.color.setRGB(1.24, 0.98, 1.0)
      break
    case 'SUP Layered turquoise mineral':
      material.color.setRGB(1.06, 0.97, 0.96)
      break
    case 'SUP Champagne gold':
      material.color.set('#e8c3aa')
      break
    case 'SUP Brushed rose gold':
      material.color.setRGB(1.04, 0.98, 0.94)
      break
    case 'SUP Pearl water highlights':
      material.color.set('#f2e5df')
      break
    case 'SUP Still aqua water':
      material.color.set('#cadfd8')
      break
    case 'SUP Lavender quartz':
    case 'SUP Cyan quartz':
    case 'SUP Pink opal':
      material.specularColor?.lerp(new THREE.Color('#f6dfd6'), 0.42)
      break
  }
}

const AURORA_FACETS = {
  'SUP Lavender quartz': ['#ad84ef', 0.38],
  'SUP Cyan quartz': ['#45e0e4', 0.48],
  'SUP Pink opal': ['#f16cbe', 0.46],
  'SUP Iridescent foliage': ['#3996b0', 0.54],
}

// The underside's existing colored seams receive light; the mineral body stays dark.
export function applyAuroraIslandPaint(colors, materialName) {
  const color = new THREE.Color()
  const tint = AURORA_FACETS[materialName]
  const mineral = materialName === 'SUP Layered turquoise mineral'
  if (!tint && !mineral) return
  const target = new THREE.Color(tint?.[0] || '#23778e')
  const peak = Math.max(target.r, target.g, target.b)
  const scaled = new THREE.Color()
  for (let i = 0; i < colors.count; i++) {
    color.setRGB(colors.getX(i), colors.getY(i), colors.getZ(i))
    const brightness = Math.max(color.r, color.g, color.b)
    if (mineral) {
      const seam = Math.max(color.b - color.r, color.g - color.r) > 0.025
      target.set(seam ? '#84e5eb' : color.r - color.g > 0.13 ? '#a194cc' : '#67a8be')
      scaled.copy(target).multiplyScalar(brightness * (seam ? 2.0 : 1.6))
      color.copy(scaled)
    } else {
      color.lerp(scaled.copy(target).multiplyScalar(brightness / peak), tint[1])
    }
    colors.setXYZ(i, color.r, color.g, color.b)
  }
}

export function applyAuroraIslandMaterial(material) {
  if (material.userData.auroraTone) return
  material.userData.auroraTone = true
  switch (material.name) {
    case 'SUP Opalescent ground':
      material.color.setRGB(0.34, 0.42, 0.68)
      material.roughness = 0.42
      material.clearcoat = 0.18
      material.clearcoatRoughness = 0.36
      material.normalScale?.setScalar(0.28)
      break
    case 'SUP Champagne gold':
      material.color.set('#e7b58b')
      material.roughness = 0.28
      break
    case 'SUP Brushed rose gold':
      material.color.set('#e69bb5')
      material.roughness = 0.3
      break
    case 'SUP Pearl water highlights':
      material.color.set('#bbf4ff')
      material.emissive.set('#75cfe8')
      material.emissiveIntensity = 0.5
      break
    case 'SUP Still aqua water':
      material.color.set('#5dbbcf')
      material.roughness = 0.12
      material.emissive.set('#1b7888')
      material.emissiveIntensity = 0.16
      break
    case 'SUP Warm luminous filaments':
      material.emissive.set('#ffe4a6')
      material.emissiveIntensity = 3.2
      break
    case 'SUP Layered turquoise mineral':
    case 'SUP Lavender quartz':
    case 'SUP Cyan quartz':
    case 'SUP Pink opal': {
      const mineral = material.name === 'SUP Layered turquoise mineral'
      const previousCompile = material.onBeforeCompile
      material.onBeforeCompile = function(shader, renderer) {
        previousCompile.call(this, shader, renderer)
        shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `
          #include <emissivemap_fragment>
          float auroraEdge = 1.0 - max(0.0, dot(normal, normalize(vViewPosition)));
          auroraEdge *= auroraEdge;
          ${mineral ? `
            float seam = smoothstep(0.82, 0.94, diffuseColor.g / max(0.001, diffuseColor.b));
            totalEmissiveRadiance += vec3(0.08, 0.75, 0.95) * seam * (0.18 + 0.35 * auroraEdge);
          ` : `
            totalEmissiveRadiance += vec3(0.30, 0.85, 1.0) * auroraEdge * auroraEdge * 0.85;
          `}
        `)
      }
      material.customProgramCacheKey = () => `sup-aurora-island-${mineral ? 'seams' : 'quartz'}-v1`
      break
    }
  }
}
