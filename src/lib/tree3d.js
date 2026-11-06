// 절차 생성 3D 나무 (three.js). 사물 소리용. 규칙은 lib/tree.js, 반환 형식은 buildFlower3D와 같다
// 반환 Group.userData: { headY, setOpen(p) }  p = 0(씨앗) ~ 1(다 자람)
import * as THREE from 'three'
import { treeParams } from './tree.js'
import { toColor } from './flower3d.js'

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const easeOutBack = (x) => {
  const c1 = 1.3, c3 = c1 + 1
  return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2
}
const UP = new THREE.Vector3(0, 1, 0)

// a에서 b로 뻗는 가는 원통(가지)
function limb(a, b, r0, r1, mat) {
  const dir = new THREE.Vector3().subVectors(b, a)
  const len = dir.length()
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 6), mat)
  mesh.position.copy(a).addScaledVector(dir, 0.5)
  mesh.quaternion.setFromUnitVectors(UP, dir.normalize())
  return mesh
}

export function buildTree3D(f) {
  const p = treeParams(f)
  const n = p.branches
  const len = (i) => p.lengths?.[i] ?? 1
  const H = 0.35 + 0.65 * p.size // 키: 소리가 클수록 크다
  const trunkR = (0.02 + 0.02 * p.size) * (p.dark ? 1.3 : 1)

  const bark = new THREE.MeshStandardMaterial({ color: '#7a5a43', roughness: 0.9 })
  const leafColor = toColor(p.foliage)
  const leaf = new THREE.MeshStandardMaterial({
    color: leafColor, roughness: 0.6, flatShading: true,
    emissive: leafColor, emissiveIntensity: 0.12,
  })

  const tree = new THREE.Group() // 땅에서 자라는 부분. 이 그룹만 키운다
  const g = new THREE.Group()
  g.add(tree)

  const trunkH = p.kind === 'pine' ? H * 0.75 : H
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(trunkR * 0.6, trunkR, trunkH, 7), bark)
  trunk.position.y = trunkH / 2
  tree.add(trunk)

  if (p.kind === 'pine') {
    // 소나무: 위로 갈수록 좁아지는 뾰족한 층. 층 너비 = 그 순간의 소리 크기
    const step = (H - 0.1) / (n + 0.4)
    for (let i = 0; i < n; i++) {
      const r = (0.2 + 0.13 * p.size) * (1 - i / (n + 1.2)) * (0.75 + 0.25 * len(i))
      const h = step * 1.9
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 8), leaf)
      cone.position.y = 0.12 + i * step + h / 2
      tree.add(cone)
    }
  } else if (p.kind === 'willow') {
    // 버드나무: 꼭대기에서 바깥으로 나갔다가 아래로 늘어지는 가지
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.1 + 0.07 * p.size, 10, 8), leaf)
    top.scale.y = 0.75
    top.position.y = H
    tree.add(top)
    const leafBall = new THREE.SphereGeometry(0.02 + 0.008 * p.size, 6, 5)
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
      tree.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.008, 4, false), leaf))
      for (const t of [0.5, 0.75, 1]) {
        const b = new THREE.Mesh(leafBall, leaf)
        b.position.copy(curve.getPoint(t))
        tree.add(b)
      }
    }
  } else {
    // 활엽수: 줄기에서 돌아가며 뻗는 가지 끝마다 잎 뭉치. 가지 길이 = 소리 크기
    for (let i = 0; i < n; i++) {
      const t = 0.42 + 0.4 * (i / Math.max(n - 1, 1))
      const start = new THREE.Vector3(0, H * t, 0)
      const phi = i * 2.4
      const tilt = ((28 + (i % 3) * 9) * Math.PI) / 180
      const L = (0.2 + 0.18 * p.size) * (0.5 + 0.5 * len(i))
      const end = start.clone().add(new THREE.Vector3(
        Math.sin(tilt) * Math.cos(phi), Math.cos(tilt), Math.sin(tilt) * Math.sin(phi),
      ).multiplyScalar(L))
      tree.add(limb(start, end, trunkR * 0.45, trunkR * 0.25, bark))
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry((0.09 + 0.08 * p.size) * (0.7 + 0.3 * len(i)), 1), leaf)
      blob.position.copy(end)
      tree.add(blob)
    }
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15 + 0.12 * p.size, 1), leaf)
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
