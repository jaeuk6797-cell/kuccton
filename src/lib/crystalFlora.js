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

export const getFloraPalette = (tone = 'warm') => tone === 'default' ? DEFAULT_PALETTE : WARM_PALETTE

// Remap presentation only: stored emotion colors and pair inputs remain unchanged.
export function floraColor(color, tone = 'warm') {
  if (tone === 'default') return color.clone()
  const hsl = color.getHSL({}, THREE.SRGBColorSpace)
  const degrees = hsl.h * 360
  let hue = degrees
  if (degrees >= 75 && degrees < 190) hue = 330 - (degrees - 75) * 0.48
  else if (degrees >= 190 && degrees < 260) hue = 270 + (degrees - 190) * 0.2
  else if (degrees >= 260 && degrees < 300) hue = 284 + (degrees - 260) * 0.45
  else if (degrees >= 35 && degrees < 75) hue = 30 + (degrees - 35) * 0.5
  return new THREE.Color().setHSL(hue / 360, hsl.s * 0.78, Math.min(0.86, hsl.l + 0.025), THREE.SRGBColorSpace)
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
