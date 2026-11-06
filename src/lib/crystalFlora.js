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
const AURORA_PALETTE = {
  pearl: new THREE.Color('#e4efff'),
  aqua: new THREE.Color('#45ddd9'),
  lavender: new THREE.Color('#9b7ae2'),
  blush: new THREE.Color('#ec73bf'),
  champagne: new THREE.Color('#e3b776'),
  stem: '#376b80', leaf: '#348f9f', stamen: '#f6d491',
  trunk: '#447786', darkTrunk: '#56557c',
}

export const getFloraPalette = (tone = 'warm') => tone === 'default' ? DEFAULT_PALETTE
  : tone === 'aurora' ? AURORA_PALETTE : WARM_PALETTE

// Remap presentation only: stored emotion colors and pair inputs remain unchanged.
export function floraColor(color, tone = 'warm') {
  if (tone === 'default') return color.clone()
  const hsl = color.getHSL({}, THREE.SRGBColorSpace)
  const degrees = hsl.h * 360
  let hue = degrees
  if (tone === 'aurora') {
    if (degrees >= 75 && degrees < 155) hue = 318 - (degrees - 75) * 0.24
    else if (degrees >= 155 && degrees < 195) hue = 173 + (degrees - 155) * 0.28
    else if (degrees >= 195 && degrees < 260) hue = 246 + (degrees - 195) * 0.42
    else if (degrees >= 260 && degrees < 300) hue = 281 + (degrees - 260) * 0.38
    else if (degrees < 35) hue = 342 + degrees * 0.24
    return new THREE.Color().setHSL(hue / 360, Math.min(0.85, hsl.s * 0.98 + 0.08),
      Math.min(0.77, Math.max(0.37, hsl.l - 0.025)), THREE.SRGBColorSpace)
  }
  if (degrees >= 75 && degrees < 190) hue = 330 - (degrees - 75) * 0.48
  else if (degrees >= 190 && degrees < 260) hue = 270 + (degrees - 190) * 0.2
  else if (degrees >= 260 && degrees < 300) hue = 284 + (degrees - 260) * 0.45
  else if (degrees >= 35 && degrees < 75) hue = 30 + (degrees - 35) * 0.5
  return new THREE.Color().setHSL(hue / 360, hsl.s * 0.78, Math.min(0.86, hsl.l + 0.025), THREE.SRGBColorSpace)
}

// A narrow view-dependent glint, sampled in the existing material pass. Petal contours
// use one scalar attribute; imported meshes use their existing normals without new geometry.
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
      float floraGlint = ${contour ? 'vAuroraEdge * (0.18 + 0.82 * floraRim)' : 'floraRim * floraRim'};
      totalEmissiveRadiance += vec3(0.55, 0.90, 1.15) * floraGlint * ${strength.toFixed(3)};
    `)
  }
  material.customProgramCacheKey = () => `${previousKey}:sup-aurora-flora-rim-v1:${contour}:${strength}`
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
