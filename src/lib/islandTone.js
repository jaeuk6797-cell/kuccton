import * as THREE from 'three'

const FACET_TINTS = {
  'SUP Lavender quartz': ['#d7afd4', 0.62],
  'SUP Cyan quartz': ['#efd5b7', 0.76],
  'SUP Pink opal': ['#efb8c9', 0.60],
  'SUP Iridescent foliage': ['#d9c0c8', 0.65],
}

// Recolor the imported paint once. Positions, normals, UVs and facet alpha stay intact.
export function applyWarmIslandPaint(mesh) {
  const colors = mesh.geometry.attributes.color
  const tint = FACET_TINTS[mesh.material.name]
  if (!colors || !tint || mesh.geometry.userData.warmPaint) return
  mesh.geometry.userData.warmPaint = true
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
  colors.needsUpdate = true
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
