import * as THREE from 'three'

export function createGardenEnvironment(renderer, size = 256, tone = 'warm') {
  // Capture broad pastel sky reflections once; only the filtered cubemap is sampled each frame.
  const studio = new THREE.Scene()
  const warm = tone !== 'default'
  studio.background = new THREE.Color(warm ? '#e7cfc9' : '#c5d3e6')
  const geometry = new THREE.PlaneGeometry(1, 1, 12, 12)
  const position = geometry.attributes.position
  const colors = []
  for (let i = 0; i < position.count; i++) {
    const radiusSquared = 4 * (position.getX(i) ** 2 + position.getY(i) ** 2)
    colors.push(1, 1, 1, Math.max(0, 1 - radiusSquared) ** 2)
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4))
  // Overlapping sky bands cover the full orbit; the smaller warm key adds a moving glint.
  for (const [position, scale, color, intensity] of [
    [[3.8, 2, -5.6], [12, 3.8], warm ? '#f6d8b9' : '#b9e7f0', 8.75],
    [[-3.8, 2, -5.6], [12, 3.8], warm ? '#c6abe3' : '#c6b7ec', 8.75],
    [[-0.8, 2.6, -6.2], [3.6, 1.2], warm ? '#fff2df' : '#fff2ed', 14],
    [[1.3, 1.7, -6.2], [6, 3], warm ? '#f6c9cf' : '#f5c8df', 7],
    [[6.4, 2, 0], [12, 3.8], warm ? '#efd0d5' : '#ecd5ee', 7.5],
    [[-6.4, 2, 0], [12, 3.8], warm ? '#bfe1de' : '#bfe9e8', warm ? 6.2 : 7.5],
    [[4.5, 1.9, 4.5], [7, 2.5], warm ? '#e4c8de' : '#cdd4f3', 6.5],
    [[-4.5, 1.9, 4.5], [7, 2.5], warm ? '#f1d4c2' : '#eed0e2', 6.5],
    [[0, 2, 6.4], [8, 2.6], warm ? '#dac3e6' : '#e3def5', 9],
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
