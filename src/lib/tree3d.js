// 절차 생성 3D 나무 (three.js). 사물 소리용. 규칙은 lib/tree.js, 반환 형식은 buildFlower3D와 같다
// 반환 Group.userData: { headY, setOpen(p) }  p = 0(씨앗) ~ 1(다 자람)
import * as THREE from 'three'
import { treeParams } from './tree.js'
import { toColor } from './flower3d.js'
import { applyAuroraFloraRim, floraColor, getFloraPalette, opalMaterial } from './crystalFlora.js'

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const easeOutBack = (x) => {
  const c1 = 1.3, c3 = c1 + 1
  return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2
}
const UP = new THREE.Vector3(0, 1, 0)
const TIER_CUT = [[0, -0.5], [0.9, -0.5], [1, -0.36], [0.44, 0.12], [0, 0.5]]
const CROWN_CUT = [[0, -1], [0.75, -0.69], [1, -0.22], [0.88, 0.44], [0, 1]]
const DROP_CUT = [[0, -1], [1, -0.16], [0.82, 0.38], [0, 1]]

function crystalCut(profile, baseColor, tone) {
  const palette = getFloraPalette(tone)
  const balanced = tone === 'balanced'
  const { aqua: AQUA, pearl: PEARL, lavender: LAVENDER, blush: BLUSH, champagne: CHAMPAGNE } = palette
  const sides = 6
  const geometry = new THREE.LatheGeometry(profile.map(([radius, y]) => new THREE.Vector2(radius, y)), sides).toNonIndexed()
  const positions = geometry.attributes.position
  const colors = []
  const facets = tone === 'default' ? [AQUA, PEARL, LAVENDER, BLUSH, AQUA, LAVENDER]
    : balanced ? [new THREE.Color(palette.leaf), PEARL, AQUA, new THREE.Color(palette.leaf), new THREE.Color(palette.darkGreen), LAVENDER]
      : tone === 'aurora' ? [AQUA, LAVENDER, BLUSH, AQUA, PEARL, LAVENDER]
        : [BLUSH, PEARL, LAVENDER, CHAMPAGNE, AQUA, BLUSH]
  const verticesPerSide = (profile.length - 1) * 6
  const tint = new THREE.Color()
  for (let i = 0; i < positions.count; i++) {
    const side = Math.floor(i / verticesPerSide)
    const y = positions.getY(i)
    tint.copy(baseColor).lerp(facets[side], balanced ? 0.24 : 0.42)
      .lerp(PEARL, balanced ? 0.10 + 0.07 * y : tone === 'aurora' ? 0.06 + 0.06 * y : 0.20 + 0.15 * y)
    colors.push(tint.r, tint.g, tint.b)
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  return geometry
}

// a에서 b로 뻗는 가는 원통(가지)
function limb(a, b, r0, r1, mat) {
  const dir = new THREE.Vector3().subVectors(b, a)
  const len = dir.length()
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 6), mat)
  mesh.position.copy(a).addScaledVector(dir, 0.5)
  mesh.quaternion.setFromUnitVectors(UP, dir.normalize())
  return mesh
}

export function buildTree3D(f, { tone = 'balanced' } = {}) {
  const palette = getFloraPalette(tone)
  const balanced = tone === 'balanced'
  const p = treeParams(f)
  const n = p.branches
  const len = (i) => p.lengths?.[i] ?? 1
  const H = 0.35 + 0.65 * p.size // 키: 소리가 클수록 크다
  const trunkR = (0.02 + 0.02 * p.size) * (p.dark ? 1.3 : 1)

  const stem = new THREE.MeshStandardMaterial({
    color: p.dark ? palette.darkTrunk : palette.trunk, roughness: 0.46, metalness: 0.14, flatShading: true,
  })
  const leafColor = balanced ? toColor(p.foliage).lerp(new THREE.Color(palette.leaf), 0.50)
    : tone === 'aurora' ? toColor(p.foliage).lerp(palette.aqua, 0.70)
      : floraColor(toColor(p.foliage), tone).lerp(tone === 'default' ? palette.aqua : palette.pearl, 0.34)
  const leaf = opalMaterial({ roughness: 0.31, flatShading: true })
  if (balanced) {
    stem.metalness = 0.07
    leaf.roughness = 0.38
    leaf.metalness = 0.06
    leaf.clearcoat = 0.18
    leaf.iridescence = 0.16
  }
  if (tone === 'aurora') {
    stem.metalness = 0.08
    leaf.metalness = 0.04
    leaf.roughness = 0.34
    leaf.iridescence = 0.34
    leaf.clearcoat = 0.24
    applyAuroraFloraRim(leaf, { strength: 0.32 })
  }

  const tree = new THREE.Group() // 땅에서 자라는 부분. 이 그룹만 키운다
  const g = new THREE.Group()
  g.add(tree)

  const trunkH = p.kind === 'pine' ? H * 0.75 : H
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(trunkR * 0.6, trunkR, trunkH, 7), stem)
  trunk.position.y = trunkH / 2
  tree.add(trunk)

  if (p.kind === 'pine') {
    // 소나무: 위로 갈수록 좁아지는 뾰족한 층. 층 너비 = 그 순간의 소리 크기
    const step = (H - 0.1) / (n + 0.4)
    const tierGeo = crystalCut(TIER_CUT, leafColor, tone)
    for (let i = 0; i < n; i++) {
      const r = (0.2 + 0.13 * p.size) * (1 - i / (n + 1.2)) * (0.75 + 0.25 * len(i))
      const h = step * 1.9
      const tier = new THREE.Mesh(tierGeo, leaf)
      tier.scale.set(r, h, r)
      tier.rotation.y = i * 0.34
      tier.position.y = 0.12 + i * step + h / 2
      tree.add(tier)
    }
  } else if (p.kind === 'willow') {
    // 버드나무: 꼭대기에서 바깥으로 나갔다가 아래로 늘어지는 가지
    const top = new THREE.Mesh(crystalCut(CROWN_CUT, leafColor, tone), leaf)
    const topR = 0.1 + 0.07 * p.size
    top.scale.set(topR, topR * 0.75, topR)
    top.position.y = H
    tree.add(top)
    const dropGeo = crystalCut(DROP_CUT, leafColor, tone)
    const dropR = 0.02 + 0.008 * p.size
    for (let i = 0; i < n; i++) {
      const phi = (i / n) * Math.PI * 2
      const reach = (0.12 + 0.18 * p.size) * (0.6 + 0.4 * len(i))
      const droop = (0.2 + 0.28 * p.size) * len(i)
      const dx = Math.cos(phi) * reach
      const dz = Math.sin(phi) * reach
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, H, 0),
        new THREE.Vector3(dx * 0.5, H + 0.06, dz * 0.5),
        new THREE.Vector3(dx, H - 0.02, dz),
        new THREE.Vector3(dx * 1.05, H - droop, dz * 1.05),
      ])
      tree.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.008, 4, false), stem))
      for (const t of [0.5, 0.75, 1]) {
        const drop = new THREE.Mesh(dropGeo, leaf)
        drop.scale.set(dropR * 0.78, dropR * (1.4 + 0.35 * t), dropR * 0.78)
        drop.position.copy(curve.getPoint(t))
        drop.quaternion.setFromUnitVectors(UP, curve.getTangent(t).negate())
        tree.add(drop)
      }
    }
  } else {
    // 활엽수: 줄기에서 돌아가며 뻗는 가지 끝마다 잎 뭉치. 가지 길이 = 소리 크기
    const crownGeo = crystalCut(CROWN_CUT, leafColor, tone)
    for (let i = 0; i < n; i++) {
      const t = 0.42 + 0.4 * (i / Math.max(n - 1, 1))
      const start = new THREE.Vector3(0, H * t, 0)
      const phi = i * 2.4
      const tilt = ((28 + (i % 3) * 9) * Math.PI) / 180
      const L = (0.2 + 0.18 * p.size) * (0.5 + 0.5 * len(i))
      const end = start.clone().add(new THREE.Vector3(
        Math.sin(tilt) * Math.cos(phi), Math.cos(tilt), Math.sin(tilt) * Math.sin(phi),
      ).multiplyScalar(L))
      tree.add(limb(start, end, trunkR * 0.45, trunkR * 0.25, stem))
      const tip = new THREE.Mesh(crownGeo, leaf)
      const r = (0.09 + 0.08 * p.size) * (0.7 + 0.3 * len(i))
      tip.scale.set(r * 0.86, r * 1.12, r * 0.86)
      tip.position.copy(end)
      tip.quaternion.setFromUnitVectors(UP, end.clone().sub(start).normalize())
      tree.add(tip)
    }
    const crown = new THREE.Mesh(crownGeo, leaf)
    const r = 0.15 + 0.12 * p.size
    crown.scale.set(r, r * 0.98, r)
    crown.position.y = H
    tree.add(crown)
  }

  g.traverse((o) => { if (o.isMesh) o.castShadow = true })
  g.userData.headY = H + 0.12
  g.userData.setOpen = (open) => {
    tree.scale.setScalar(Math.max(0.02, easeOutBack(clamp(open, 0, 1))))
  }
  g.userData.setOpen(0)
  return g
}
