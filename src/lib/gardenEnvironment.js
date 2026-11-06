import * as THREE from 'three'

export function createGardenEnvironment(renderer, size = 256) {
  // Capture broad pastel sky reflections once; only the filtered cubemap is sampled each frame.
  const studio = new THREE.Scene()
  studio.background = new THREE.Color('#c5d3e6')
  const geometry = new THREE.PlaneGeometry(1, 1, 12, 12)
  const position = geometry.attributes.position
  const colors = []
  for (let i = 0; i < position.count; i++) {
    const radiusSquared = 4 * (position.getX(i) ** 2 + position.getY(i) ** 2)
    colors.push(1, 1, 1, Math.max(0, 1 - radiusSquared) ** 2)
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4))
  // Rear sky bands cross the ground's reflected horizon as the camera orbits.
  for (const [position, scale, color, intensity] of [
    [[1.3, 1.25, -6.2], [5.2, 2.2], '#f5c8df', 7.875],
    [[3.8, 2.5, -5.6], [4.4, 1.8], '#b9e7f0', 8.75],
    [[-3.8, 2.5, -5.6], [4.4, 1.8], '#c6b7ec', 8.75],
    [[-0.8, 2.6, -6.2], [3.6, 1.2], '#fff2ed', 14],
  ]) {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(intensity), toneMapped: false,
      vertexColors: true, transparent: true, depthWrite: false,
    })
    const panel = new THREE.Mesh(geometry, material)
    panel.position.set(...position)
    panel.scale.set(scale[0], scale[1], 1)
    panel.lookAt(0, 0, 0)
    studio.add(panel)
  }
  const generator = new THREE.PMREMGenerator(renderer)
  // Card falloff supplies softness; preserve enough contrast for a moving polished highlight.
  const environment = generator.fromScene(studio, 0.03, 0.1, 30, { size })
  generator.dispose()
  geometry.dispose()
  for (const panel of studio.children) panel.material.dispose()
  return environment
}
