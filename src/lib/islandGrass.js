import * as THREE from 'three'

const MAX_CLUMPS = 1000
const MIN_HEIGHT = 0.075
const MAX_HEIGHT = 0.12
const EDGE_CLEARANCE = 0.09
const STEM_CLEARANCE = 0.065
const UP = new THREE.Vector3(0, 1, 0)
export const BALANCED_GRASS_MIDTONE = 0x91bd92
const GRASS_THEMES = {
  balanced: { colors: [0x67976d, BALANCED_GRASS_MIDTONE, 0xb8d9ac], tint: 0xffffff, roughness: 1, environment: 0.12 },
  warm: { colors: [0x758b65, 0xa1b685, 0xc3cf9e], tint: 0xfffaf3, roughness: 0.98, environment: 0.10 },
  aurora: { colors: [0x427e72, 0x72b4a1, 0xaad5c5], tint: 0xeefcff, roughness: 0.96, environment: 0.16 },
  default: { colors: [0x678e7e, 0x91b8a5, 0xb9d2be], tint: 0xf7fcff, roughness: 1, environment: 0.10 },
}

function randomGenerator(seed) {
  let state = seed >>> 0
  return () => {
    state = Math.imul(state, 1664525) + 1013904223 | 0
    return (state >>> 0) / 4294967296
  }
}

function tuftGeometry() {
  const positions = [], colors = [], indices = []
  // Two tapered ribbons bend through a middle row: three triangles per blade.
  // Narrow, separated roots and unequal angles avoid a repeated folded-V silhouette.
  for (let blade = 0; blade < 2; blade++) {
    const angle = [0.23, 2.52][blade]
    const height = [1, 0.86][blade]
    const rootWidth = [0.025, 0.024][blade]
    const width = [0.12, 0.11][blade]
    const lean = [1, 0.90][blade]
    const offset = [-0.025, 0.022][blade]
    const vertices = [
      [offset - rootWidth, 0, 0], [offset + rootWidth, 0, 0],
      [offset - width, height, lean * 0.42],
      [offset + width, height, lean * 0.42],
      [offset + 0.025, height * 0.78, lean],
    ]
    const start = positions.length / 3
    vertices.forEach(([x, y, z], i) => {
      positions.push(x * Math.cos(angle) - z * Math.sin(angle), y,
        x * Math.sin(angle) + z * Math.cos(angle))
      colors.push(1, 1, 1)
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

function cross(a, b, c) {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)
}

function inTriangle(p, a, b, c) {
  const x = cross(a, b, p), y = cross(b, c, p), z = cross(c, a, p)
  return (x >= 0 && y >= 0 && z >= 0) || (x <= 0 && y <= 0 && z <= 0)
}

function segmentsDistanceSquared(a, b, c, d) {
  const abC = cross(a, b, c), abD = cross(a, b, d)
  const cdA = cross(c, d, a), cdB = cross(c, d, b)
  if (((abC > 0 && abD < 0) || (abC < 0 && abD > 0))
    && ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0))) return 0
  return Math.min(edgeDistanceSquared(a.x, a.z, { a: c, b: d }),
    edgeDistanceSquared(b.x, b.z, { a: c, b: d }),
    edgeDistanceSquared(c.x, c.z, { a, b }), edgeDistanceSquared(d.x, d.z, { a, b }))
}

function triangleHitsBox(a, b, c, box) {
  if (Math.max(a.x, b.x, c.x) < box.min.x || Math.min(a.x, b.x, c.x) > box.max.x
    || Math.max(a.z, b.z, c.z) < box.min.z || Math.min(a.z, b.z, c.z) > box.max.z) return false
  const centerX = (box.min.x + box.max.x) / 2, centerZ = (box.min.z + box.max.z) / 2
  const halfX = (box.max.x - box.min.x) / 2, halfZ = (box.max.z - box.min.z) / 2
  for (const [p, q] of [[a, b], [b, c], [c, a]]) {
    const nx = p.z - q.z, nz = q.x - p.x
    const values = [a.x * nx + a.z * nz, b.x * nx + b.z * nz, c.x * nx + c.z * nz]
    const center = centerX * nx + centerZ * nz, radius = halfX * Math.abs(nx) + halfZ * Math.abs(nz)
    if (Math.max(...values) < center - radius || Math.min(...values) > center + radius) return false
  }
  return true
}

// Test the six real projected triangles, not a large disc around the root.
function footprintFits(points, indices, boundaries, obstacles, plants) {
  for (let i = 0; i < indices.length; i += 3) {
    const a = points[indices[i]], b = points[indices[i + 1]], c = points[indices[i + 2]]
    const minX = Math.min(a.x, b.x, c.x), maxX = Math.max(a.x, b.x, c.x)
    const minZ = Math.min(a.z, b.z, c.z), maxZ = Math.max(a.z, b.z, c.z)
    for (const edge of boundaries) {
      if (Math.max(edge.a.x, edge.b.x) < minX - EDGE_CLEARANCE || Math.min(edge.a.x, edge.b.x) > maxX + EDGE_CLEARANCE
        || Math.max(edge.a.z, edge.b.z) < minZ - EDGE_CLEARANCE || Math.min(edge.a.z, edge.b.z) > maxZ + EDGE_CLEARANCE) continue
      if (inTriangle(edge.a, a, b, c) || inTriangle(edge.b, a, b, c)
        || segmentsDistanceSquared(a, b, edge.a, edge.b) < EDGE_CLEARANCE ** 2
        || segmentsDistanceSquared(b, c, edge.a, edge.b) < EDGE_CLEARANCE ** 2
        || segmentsDistanceSquared(c, a, edge.a, edge.b) < EDGE_CLEARANCE ** 2) return false
    }
    if (obstacles.some(box => triangleHitsBox(a, b, c, box))) return false
    for (const plant of plants) {
      if (plant.x < minX - STEM_CLEARANCE || plant.x > maxX + STEM_CLEARANCE
        || plant.z < minZ - STEM_CLEARANCE || plant.z > maxZ + STEM_CLEARANCE) continue
      if (inTriangle(plant, a, b, c)
        || edgeDistanceSquared(plant.x, plant.z, { a, b }) < STEM_CLEARANCE ** 2
        || edgeDistanceSquared(plant.x, plant.z, { a: b, b: c }) < STEM_CLEARANCE ** 2
        || edgeDistanceSquared(plant.x, plant.z, { a: c, b: a }) < STEM_CLEARANCE ** 2) return false
    }
  }
  return true
}

/**
 * Add grass to an already scaled/positioned GLB. Returns null if its named surface is absent.
 * updatePlants accepts positions in `space` coordinates (e.g. plant.position, flowerLayer).
 * setTheme recolors the same resources; unknown themes fall back to balanced.
 * Dispose the controller before releasing the model that owns its mesh.
 */
export function createIslandGrass(model, { count = MAX_CLUMPS, seed = 27439, theme, tone } = {}) {
  count = Math.min(MAX_CLUMPS, Math.max(0, Math.floor(count)))
  if (!count) return null
  model.updateWorldMatrix(true, true)
  const surfaces = [], obstacleBoxes = []
  model.traverse(object => {
    if (!object.isMesh) return
    if (/^Island_Surface/.test(object.name)) surfaces.push(object)
    // The polished edge mesh spans every cluster; use individual facet families instead.
    if (object.name === 'Fountain_Basin' || /^Island_Peripheral_Crystals.*Cluster/.test(object.name)
      || /^Island_Ornamental_Ring.*feet/i.test(object.name)) {
      obstacleBoxes.push(new THREE.Box3().setFromObject(object).expandByScalar(0.05))
    }
  })
  if (!surfaces.length) return null
  const bounds = new THREE.Box3()
  for (const surface of surfaces) bounds.union(new THREE.Box3().setFromObject(surface))
  const boundaries = projectedEdges(surfaces)
  const geometry = tuftGeometry()
  const vertices = geometry.attributes.position
  const indices = geometry.index.array
  const projected = Array.from({ length: vertices.count }, () => new THREE.Vector3())
  const trialMatrix = new THREE.Matrix4(), rotation = new THREE.Quaternion()
  const turn = new THREE.Quaternion(), dimensions = new THREE.Vector3()
  function fit(record, plants, heightFraction = 1) {
    for (const shrink of [1, 0.82, 0.64, 0.46, 0.28, 0.14]) {
      for (const offset of [0, 1.2, -1.2, Math.PI]) {
        const horizontal = record.horizontal * shrink, angle = record.angle + offset
        rotation.copy(record.tilt).multiply(turn.setFromAxisAngle(UP, angle))
        trialMatrix.compose(record.position, rotation,
          dimensions.set(horizontal, record.height * heightFraction, horizontal))
        for (let i = 0; i < projected.length; i++) projected[i].fromBufferAttribute(vertices, i).applyMatrix4(trialMatrix)
        if (footprintFits(projected, indices, boundaries, obstacleBoxes, plants)) {
          return { world: trialMatrix.clone(), horizontal, angle }
        }
      }
    }
    return null
  }
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
  const referenceWorld = model.matrixWorld.clone()
  const modelInverse = referenceWorld.clone().invert()
  const normal = new THREE.Vector3()
  const baseMatrices = [], records = [], variations = []
  const hits = []
  for (const [x, z] of candidates) {
    if (baseMatrices.length >= count) break
    if (boundaries.some(edge => edgeDistanceSquared(x, z, edge) < (EDGE_CLEARANCE + 0.025) ** 2)) continue
    if (obstacleBoxes.some(box => x >= box.min.x && x <= box.max.x && z >= box.min.z && z <= box.max.z)) continue
    ray.ray.origin.set(x, bounds.max.y + 1, z)
    hits.length = 0
    ray.intersectObjects(surfaces, false, hits)
    if (!hits.length) continue
    const hit = hits[0]
    normal.copy(hit.face.normal).applyNormalMatrix(normalMatrix.getNormalMatrix(hit.object.matrixWorld))
    if (normal.y < 0.9) continue
    const record = {
      position: hit.point.clone(), tilt: new THREE.Quaternion().setFromUnitVectors(UP, normal),
      height: MIN_HEIGHT + (MAX_HEIGHT - MIN_HEIGHT) * random(),
      horizontal: 0.26 + random() * 0.05, angle: random() * Math.PI * 2,
    }
    const fitted = fit(record, [])
    if (!fitted) continue
    record.horizontal = fitted.horizontal
    record.angle = fitted.angle
    records.push(record)
    baseMatrices.push(fitted.world.premultiply(modelInverse))
    variations.push(new THREE.Color().setRGB(0.88 + random() * 0.12, 0.94 + random() * 0.06, 0.88 + random() * 0.12))
  }

  const material = new THREE.MeshStandardMaterial({
    name: 'SUP Short mint grass', vertexColors: true, side: THREE.DoubleSide,
    roughness: 1, metalness: 0, envMapIntensity: 0.12,
  })
  const mesh = new THREE.InstancedMesh(geometry, material, baseMatrices.length)
  mesh.name = 'Island_Grass | Short garden coverage'
  // Fill opaque canopy depth before shading the opal ground hidden beneath it.
  mesh.renderOrder = -1
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

  const matrix = new THREE.Matrix4(), plantTransform = new THREE.Matrix4()
  const color = new THREE.Color()
  const vertexColors = geometry.attributes.color
  vertexColors.setUsage(THREE.DynamicDrawUsage)
  let disposed = false
  let resolvedTheme
  function setTheme(requested) {
    if (disposed) return resolvedTheme
    const next = typeof requested === 'string' && Object.hasOwn(GRASS_THEMES, requested) ? requested : 'balanced'
    if (next === resolvedTheme) return resolvedTheme
    const palette = GRASS_THEMES[next]
    for (let i = 0; i < vertexColors.count; i++) {
      const vertex = i % 5
      color.setHex(palette.colors[vertex < 2 ? 0 : vertex === 4 ? 2 : 1])
      vertexColors.setXYZ(i, color.r, color.g, color.b)
    }
    vertexColors.needsUpdate = true
    material.color.setHex(palette.tint)
    material.roughness = palette.roughness
    material.envMapIntensity = palette.environment
    mesh.userData.grassTheme = next
    resolvedTheme = next
    return next
  }
  setTheme(theme === undefined ? tone : theme)
  return {
    mesh,
    get theme() { return resolvedTheme },
    setTheme,
    updatePlants(positions, space = model) {
      if (disposed) return
      model.updateWorldMatrix(true, false)
      space.updateWorldMatrix(true, false)
      // Compare in the creation frame, so floating/bobbing never moves clearance holes.
      plantTransform.copy(model.matrixWorld).invert().premultiply(referenceWorld).multiply(space.matrixWorld)
      const plants = positions.map(p => new THREE.Vector3(p.x, p.y ?? 0, p.z).applyMatrix4(plantTransform))
      for (let i = 0; i < records.length; i++) {
        const record = records[i]
        let nearest = Infinity
        for (const plant of plants) nearest = Math.min(nearest, Math.hypot(record.position.x - plant.x, record.position.z - plant.z))
        const heightFraction = 0.30 + 0.70 * THREE.MathUtils.smoothstep(nearest, 0.08, 0.32)
        // Crop height around plants; only rotate/shrink width when a real blade hits a stem.
        const fitted = !plants.length ? null : nearest < 0.075 ? null : fit(record, plants, heightFraction)
        if (!plants.length) matrix.copy(baseMatrices[i])
        else if (fitted) matrix.copy(fitted.world).premultiply(modelInverse)
        else matrix.copy(baseMatrices[i]).scale(dimensions.setScalar(0))
        mesh.setMatrixAt(i, matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingBox()
      mesh.computeBoundingSphere()
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
