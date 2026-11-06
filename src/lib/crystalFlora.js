import * as THREE from 'three'

export const PEARL = new THREE.Color('#f2e9f3')
export const AQUA = new THREE.Color('#a1dde1')
export const LAVENDER = new THREE.Color('#b3a2df')
export const BLUSH = new THREE.Color('#e6acd2')

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
