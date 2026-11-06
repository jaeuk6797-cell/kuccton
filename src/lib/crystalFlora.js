import * as THREE from 'three'

export const PEARL = new THREE.Color('#f2e9f3')
export const AQUA = new THREE.Color('#a1dde1')
export const LAVENDER = new THREE.Color('#b3a2df')
export const BLUSH = new THREE.Color('#e6acd2')

const DEFAULT_PALETTE = {
  pearl: PEARL, aqua: AQUA, lavender: LAVENDER, blush: BLUSH,
  champagne: new THREE.Color('#d39e73'),
  stem: '#56888d', leaf: '#54858f', stamen: '#e5b995',
  trunk: '#b88c84', darkTrunk: '#936773',
}
const WARM_PALETTE = {
  pearl: new THREE.Color('#fff2e6'),
  aqua: new THREE.Color('#c0dcd5'),
  lavender: new THREE.Color('#c5a6cc'),
  blush: new THREE.Color('#efb9c2'),
  champagne: new THREE.Color('#d5aa87'),
  stem: '#a78180', leaf: '#bc9b9c', stamen: '#ebc5a3',
  trunk: '#b58a7c', darkTrunk: '#946773',
}
const BALANCED_PALETTE = {
  pearl: new THREE.Color('#fff3e5'),
  aqua: new THREE.Color('#b5d9ce'),
  lavender: new THREE.Color('#c6b5df'),
  blush: new THREE.Color('#e8b2bf'),
  champagne: new THREE.Color('#d8b58c'),
  stem: '#719A78', leaf: '#8AB99A', darkGreen: '#64856D', stamen: '#e7c89e',
  trunk: '#ad8b75', darkTrunk: '#876c5c',
}
const AURORA_PALETTE = {
  pearl: new THREE.Color('#f2e9f7'),
  aqua: new THREE.Color('#22e2d8'),
  lavender: new THREE.Color('#b54ddd'),
  blush: new THREE.Color('#f53aa8'),
  champagne: new THREE.Color('#e3b776'),
  stem: '#6096a5', leaf: '#32c9ce', stamen: '#f6d491',
  trunk: '#6b9aa3', darkTrunk: '#817ca0',
}

export const getFloraPalette = (tone = 'balanced') => tone === 'default' ? DEFAULT_PALETTE
  : tone === 'aurora' ? AURORA_PALETTE : tone === 'warm' ? WARM_PALETTE : BALANCED_PALETTE

// Remap presentation only: stored emotion colors and pair inputs remain unchanged.
export function floraColor(color, tone = 'balanced') {
  if (tone === 'default') return color.clone()
  const hsl = color.getHSL({}, THREE.SRGBColorSpace)
  // Preserve the sound's hue and both contributors' pair colors. Only soften
  // saturation and compress lightness into a readable cream-to-pastel range.
  if (tone !== 'warm' && tone !== 'aurora') {
    return new THREE.Color().setHSL(hsl.h, Math.min(0.57, hsl.s * 0.78),
      THREE.MathUtils.clamp(0.72 + (hsl.l - 0.58) * 0.35, 0.66, 0.83), THREE.SRGBColorSpace)
  }
  const degrees = hsl.h * 360
  let hue = degrees
  if (tone === 'aurora') {
    if (degrees >= 75 && degrees < 155) hue = 330 - (degrees - 75) * 0.24
    else if (degrees >= 155 && degrees < 195) hue = 173 + (degrees - 155) * 0.28
    else if (degrees >= 195 && degrees < 260) hue = 270 + (degrees - 195) * 0.30
    else if (degrees >= 260 && degrees < 300) hue = 292 + (degrees - 260) * 0.30
    else if (degrees < 35) hue = 342 + degrees * 0.24
    return new THREE.Color().setHSL(hue / 360, Math.min(0.94, Math.max(0.76, hsl.s * 0.98 + 0.18)),
      Math.min(0.65, Math.max(0.52, hsl.l - 0.005)), THREE.SRGBColorSpace)
  }
  if (degrees >= 75 && degrees < 190) hue = 330 - (degrees - 75) * 0.48
  else if (degrees >= 190 && degrees < 260) hue = 270 + (degrees - 190) * 0.2
  else if (degrees >= 260 && degrees < 300) hue = 284 + (degrees - 260) * 0.45
  else if (degrees >= 35 && degrees < 75) hue = 30 + (degrees - 35) * 0.5
  return new THREE.Color().setHSL(hue / 360, hsl.s * 0.78, Math.min(0.86, hsl.l + 0.025), THREE.SRGBColorSpace)
}

// Source: the latest Aurora material pass. It adds a glint without another draw.
export function applyAuroraFloraRim(material, { contour = false, strength = 0.55 } = {}) {
  const previousCompile = material.onBeforeCompile
  const previousKey = material.customProgramCacheKey()
  material.onBeforeCompile = function (shader, renderer) {
    previousCompile.call(this, shader, renderer)
    if (contour) {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float auroraEdge;\nvarying float vAuroraEdge;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAuroraEdge = auroraEdge;')
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vAuroraEdge;')
    }
    shader.fragmentShader = shader.fragmentShader.replace('#include <aomap_fragment>', `
      #include <aomap_fragment>
      float floraRim = 1.0 - saturate(abs(dot(geometryNormal, geometryViewDir)));
      floraRim *= floraRim;
      float floraGlint = ${contour ? 'vAuroraEdge * (0.12 + 0.88 * floraRim)' : 'floraRim * floraRim'};
      totalEmissiveRadiance += vec3(0.55, 0.90, 1.15) * floraGlint * ${strength.toFixed(3)};
    `)
  }
  material.customProgramCacheKey = () => `${previousKey}:sup-aurora-flora-rim-v2:${contour}:${strength}`
  return material
}

// A thin-film highlight over a solid mineral body. Vertex colors carry the cut and base tint.
export function opalMaterial(options) {
  return new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.34,
    metalness: 0.07,
    specularIntensity: 0.85,
    clearcoat: 0.22,
    clearcoatRoughness: 0.27,
    iridescence: 0.22,
    iridescenceIOR: 1.35,
    iridescenceThicknessMinimum: 280,
    iridescenceThicknessMaximum: 380,
    ...options,
  })
}
