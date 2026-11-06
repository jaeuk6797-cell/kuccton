import * as THREE from 'three'

const MAX_CLUMPS = 1000
const MIN_HEIGHT = 0.06
const MAX_HEIGHT = 0.13
// Includes blade splay, random width and the small tilt of the island's outer surface.
const FOOTPRINT_RADIUS = 0.17
const EDGE_CLEARANCE = FOOTPRINT_RADIUS + 0.10
const UP = new THREE.Vector3(0, 1, 0)

function randomGenerator(seed) {
  let state = seed >>> 0
  return () => {
    state = Math.imul(state, 1664525) + 1013904223 | 0
    return (state >>> 0) / 4294967296
  }
}

function tuftGeometry() {
  const positions = [], colors = [], indices = []
  const root = new THREE.Color('#67976d')
  const middle = new THREE.Color('#91bd92')
  const tip = new THREE.Color('#b8d9ac')
  // Two tapered ribbons bend through a middle row: three triangles per blade.
  // Narrow, separated roots and unequal angles avoid a repeated folded-V silhouette.
  for (let blade = 0; blade < 2; blade++) {
    const angle = [0.23, 2.52][blade]
    const height = [1, 0.83][blade]
    const rootWidth = [0.045, 0.050][blade]
    const width = [0.11, 0.105][blade]
    const lean = [0.45, 0.50][blade]
    const offset = [-0.05, 0.04][blade]
    const vertices = [
      [offset - rootWidth, 0, 0], [offset + rootWidth, 0, 0],
      [offset - width, height * 0.55, lean * 0.22],
      [offset + width, height * 0.55, lean * 0.22],
      [offset + 0.025, height, lean],
    ]
    const start = positions.length / 3
    vertices.forEach(([x, y, z], i) => {
      positions.push(x * Math.cos(angle) - z * Math.sin(angle), y,
        x * Math.sin(angle) + z * Math.cos(angle))
      const color = i < 2 ? root : i === 4 ? tip : middle
      colors.push(color.r, color.g, color.b)
    })
    indices.push(start, start + 1, start + 2,
      start + 1, start + 3, start + 2, start + 2, start + 3, start + 4)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function projectedEdges(surfaces) {
  const edges = new Map()
  const vertex = new THREE.Vector3()
  for (const surface of surfaces) {
    const geometry = surface.geometry
    const points = Array.from({ length: geometry.attributes.position.count }, (_, i) => {
      vertex.fromBufferAttribute(geometry.attributes.position, i).applyMatrix4(surface.matrixWorld)
      return { x: vertex.x, z: vertex.z, key: `${vertex.x.toFixed(5)},${vertex.y.toFixed(5)},${vertex.z.toFixed(5)}` }
    })
    const count = geometry.index?.count ?? points.length
    for (let i = 0; i < count; i += 3) {
      const face = [0, 1, 2].map(j => points[geometry.index ? geometry.index.getX(i + j) : i + j])
      for (let j = 0; j < 3; j++) {
        const a = face[j], b = face[(j + 1) % 3]
        const key = a.key < b.key ? `${a.key}|${b.key}` : `${b.key}|${a.key}`
        const edge = edges.get(key)
        if (edge) edge.count++
        else edges.set(key, { a, b, count: 1 })
      }
    }
  }
  return [...edges.values()].filter(edge => edge.count === 1)
}

function edgeDistanceSquared(x, z, { a, b }) {
  const dx = b.x - a.x, dz = b.z - a.z
  const t = THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1)
  return (x - a.x - t * dx) ** 2 + (z - a.z - t * dz) ** 2
}

/**
 * Add grass to an already scaled/positioned GLB. Returns null if its named surface is absent.
 * updatePlants accepts positions in `space` coordinates (e.g. plant.position, flowerLayer).
 * Dispose explicitly before replacing the model, or let the scene's mesh cleanup own it.
 */
export function createIslandGrass(model, { count = MAX_CLUMPS, seed = 27439 } = {}) {
  count = Math.min(MAX_CLUMPS, Math.max(0, Math.floor(count)))
  if (!count) return null
  model.updateWorldMatrix(true, true)
  const surfaces = [], crystalBoxes = []
  model.traverse(object => {
    if (!object.isMesh) return
    if (/^Island_Surface/.test(object.name)) surfaces.push(object)
    // The polished edge mesh spans every cluster; use individual facet families instead.
    if (/^Island_Peripheral_Crystals.*Cluster/.test(object.name)) {
      crystalBoxes.push(new THREE.Box3().setFromObject(object).expandByScalar(FOOTPRINT_RADIUS + 0.06))
    }
  })
  if (!surfaces.length) return null
  const bounds = new THREE.Box3()
  for (const surface of surfaces) bounds.union(new THREE.Box3().setFromObject(surface))
  const boundaries = projectedEdges(surfaces)
  const random = randomGenerator(seed)
  const candidates = []
  const grid = Math.ceil(Math.sqrt(count * 3))
  for (let row = 0; row < grid; row++) {
    for (let column = 0; column < grid; column++) {
      candidates.push([
        THREE.MathUtils.lerp(bounds.min.x, bounds.max.x, (column + 0.1 + random() * 0.8) / grid),
        THREE.MathUtils.lerp(bounds.min.z, bounds.max.z, (row + 0.1 + random() * 0.8) / grid),
      ])
    }
  }
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
  }

  const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0))
  const normalMatrix = new THREE.Matrix3()
  const modelInverse = model.matrixWorld.clone().invert()
  const normal = new THREE.Vector3(), quaternion = new THREE.Quaternion()
  const yaw = new THREE.Quaternion(), scale = new THREE.Vector3()
  const baseMatrices = [], anchors = [], variations = []
  const hits = []
  for (const [x, z] of candidates) {
    if (baseMatrices.length >= count) break
    if (boundaries.some(edge => edgeDistanceSquared(x, z, edge) < EDGE_CLEARANCE ** 2)) continue
    if (crystalBoxes.some(box => x >= box.min.x && x <= box.max.x && z >= box.min.z && z <= box.max.z)) continue
    ray.ray.origin.set(x, bounds.max.y + 1, z)
    hits.length = 0
    ray.intersectObjects(surfaces, false, hits)
    if (!hits.length) continue
    const hit = hits[0]
    normal.copy(hit.face.normal).applyNormalMatrix(normalMatrix.getNormalMatrix(hit.object.matrixWorld))
    if (normal.y < 0.9) continue
    const height = MIN_HEIGHT + (MAX_HEIGHT - MIN_HEIGHT) * random()
    const width = height * (1.20 + random() * 0.20)
    quaternion.setFromUnitVectors(UP, normal)
    yaw.setFromAxisAngle(UP, random() * Math.PI * 2)
    quaternion.multiply(yaw)
    scale.set(width, height, width)
    const matrix = new THREE.Matrix4().compose(hit.point, quaternion, scale).premultiply(modelInverse)
    baseMatrices.push(matrix)
    anchors.push(hit.point.clone().applyMatrix4(modelInverse))
    variations.push(new THREE.Color().setRGB(0.88 + random() * 0.12, 0.94 + random() * 0.06, 0.88 + random() * 0.12))
  }

  const geometry = tuftGeometry()
  const material = new THREE.MeshStandardMaterial({
    name: 'SUP Short mint grass', vertexColors: true, side: THREE.DoubleSide,
    roughness: 1, metalness: 0, envMapIntensity: 0.12,
  })
  const mesh = new THREE.InstancedMesh(geometry, material, baseMatrices.length)
  mesh.name = 'Island_Grass | Short garden coverage'
  mesh.castShadow = false
  mesh.receiveShadow = true
  mesh.raycast = () => {}
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  baseMatrices.forEach((matrix, i) => {
    mesh.setMatrixAt(i, matrix)
    mesh.setColorAt(i, variations[i])
  })
  mesh.computeBoundingBox()
  mesh.computeBoundingSphere()
  mesh.userData.clumps = baseMatrices.length
  mesh.userData.triangles = baseMatrices.length * 6
  model.add(mesh)

  const matrix = new THREE.Matrix4(), anchor = new THREE.Vector3()
  let disposed = false
  return {
    mesh,
    updatePlants(positions, space = model) {
      if (disposed) return
      model.updateWorldMatrix(true, false)
      space.updateWorldMatrix(true, false)
      const plants = positions.map(p => new THREE.Vector3(p.x, p.y ?? 0, p.z).applyMatrix4(space.matrixWorld))
      for (let i = 0; i < anchors.length; i++) {
        anchor.copy(anchors[i]).applyMatrix4(model.matrixWorld)
        let nearest = Infinity
        for (const plant of plants) nearest = Math.min(nearest, Math.hypot(anchor.x - plant.x, anchor.z - plant.z))
        const clearance = THREE.MathUtils.smoothstep(nearest, 0.07, 0.32)
        // Clear the stem itself, then blend into cropped grass without moving any roots.
        const crop = Math.min(0.42 + 0.58 * clearance, (nearest - 0.045) / FOOTPRINT_RADIUS)
        scale.setScalar(nearest < 0.07 ? 0 : crop)
        matrix.copy(baseMatrices[i]).scale(scale)
        mesh.setMatrixAt(i, matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
    },
    dispose() {
      if (disposed) return
      disposed = true
      mesh.removeFromParent()
      mesh.dispose()
      geometry.dispose()
      material.dispose()
    },
  }
}
