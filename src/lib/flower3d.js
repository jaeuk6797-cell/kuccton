// 절차 생성 3D 꽃 (three.js). feat/3d의 Flower3D(R3F)를 이 앱 구조에 맞게 옮긴 것.
// PRD 4.4: 꽃잎 수 = onset, 양성모음 = 작고 2겹 / 음성모음 = 크고 3겹,
//          된소리·거센소리 = 뾰족한 꽃잎, 음량 = 크기·중심 발광, 색 = 카테고리 계열(naming.js에서 모음 톤까지 반영됨)
import * as THREE from 'three'

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const easeOutBack = (x) => {
  const c1 = 1.3, c3 = c1 + 1
  return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2
}
const CLOSED_TILT = 0.12   // 봉오리일 때 꽃잎 기울기(0 = 똑바로 위)
const WHITE = new THREE.Color('#ffffff')

// 'hsl(335 70% 80%)', 'hsl(335, 70%, 80%)', '#ff9ec7' 모두 처리
export function toColor(input, fallback = '#f0a0c0') {
  const c = new THREE.Color()
  const m = /hsl\(\s*([\d.]+)[\s,]+([\d.]+)%[\s,]+([\d.]+)%/.exec(input || '')
  if (m) return c.setHSL(+m[1] / 360, +m[2] / 100, +m[3] / 100, THREE.SRGBColorSpace)
  try { return c.set(input || fallback) } catch { return c.set(fallback) }
}

// flowers 테이블 행(vowel 'Y'|'E', consonant '평'|'경'|'격', rms, petals, color) → 외형 값
export function flowerParams(f) {
  const dark = f.vowel === 'E'
  const loud = clamp((f.rms ?? 0.04) / 0.12, 0, 1)
  return {
    petals: Math.round(clamp(f.petals ?? 5, 3, 8)),
    layers: dark ? 3 : 2,
    size: (dark ? 0.85 : 0.6) * (0.9 + loud * 0.25),
    pointy: f.consonant === '경' || f.consonant === '격',
    glow: 1 + loud * 2.5,
  }
}

// 꽃잎 하나: 밑동이 원점, +Y로 뻗는 격자 메쉬. 가장자리는 꽃 안쪽(-Z)으로 오목, 끝은 살짝 말림
function petalGeometry({ pointy, length, width, baseColor, tipColor, cup = 0.5, curl = 0.25 }) {
  const U = 14, V = 6
  const pos = [], col = [], idx = []
  const tmp = new THREE.Color()
  for (let i = 0; i <= U; i++) {
    const u = i / U
    const hw = pointy
      ? width * Math.sin(Math.PI * u ** 0.6)
      : width * Math.sin(Math.PI * u ** 0.85) ** 0.6
    tmp.copy(baseColor).lerp(tipColor, u ** 0.7)
    for (let j = 0; j <= V; j++) {
      const v = (j / V) * 2 - 1
      pos.push(v * hw, u * length, -cup * v * v * hw - curl * u * u * length)
      col.push(tmp.r, tmp.g, tmp.b)
    }
  }
  for (let i = 0; i < U; i++) {
    for (let j = 0; j < V; j++) {
      const a = i * (V + 1) + j, b = a + V + 1
      idx.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

// colors: [색] 또는 우리의 꽃이면 [상대 색, 내 색] → 꽃잎마다 번갈아
// 반환 Group.userData: { headY, setOpen(p) }  p = 0(봉오리) ~ 1(활짝)
// 재질·지오메트리는 꽃마다 따로 만든다 → disposeFlower3D로 통째로 정리 가능
export function buildFlower3D(f, colors = [f.color], { pair = false } = {}) {
  const prm = flowerParams(f)
  const stemMat = new THREE.MeshStandardMaterial({ color: '#5f9f6e', roughness: 0.7 })
  const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.6 })
  const stamenMat = new THREE.MeshStandardMaterial({ color: '#fff1a8', emissive: '#ffd86b', emissiveIntensity: 0.15 })
  if (pair) Object.assign(prm, { layers: 3, size: 0.85, glow: 3 })
  const g = new THREE.Group()

  // 줄기 + 잎
  const h = 0.45 + prm.size * 0.25
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.03, h * 0.3, 0.02),
    new THREE.Vector3(-0.02, h * 0.7, 0),
    new THREE.Vector3(0, h, 0),
  ])
  const stem = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.016, 5, false), stemMat)
  g.add(stem)
  const leafGeo = petalGeometry({
    pointy: true, length: 0.22, width: 0.07, cup: 0.4, curl: -0.2,
    baseColor: new THREE.Color('#4f9a63'), tipColor: new THREE.Color('#8fd19a'),
  })
  const leaf = new THREE.Mesh(leafGeo, leafMat)
  leaf.position.set(0.01, h * 0.3, 0)
  leaf.rotation.set(1.0, 0.6, 0)
  g.add(leaf)

  // 꽃송이
  const head = new THREE.Group()
  head.position.y = h
  const bases = colors.map((c) => toColor(c))
  const petalMat = new THREE.MeshStandardMaterial({
    vertexColors: true, side: THREE.DoubleSide, roughness: 0.38,
    emissive: bases[0], emissiveIntensity: 0.04,
  })
  const petals = []   // { mesh, openTilt, delay }
  for (let i = 0; i < prm.layers; i++) {
    const length = 0.42 * prm.size * (1 - i * 0.2)
    const width = length * (prm.pointy ? 0.3 : 0.4)
    const geos = bases.map((c) => petalGeometry({
      pointy: prm.pointy, length, width,
      baseColor: c.clone().lerp(WHITE, 0.35 - i * 0.06),
      tipColor: c.clone().offsetHSL(0, 0.05, -0.03 * i),
    }))
    const layer = new THREE.Group()
    layer.position.y = i * 0.012
    for (let j = 0; j < prm.petals; j++) {
      const pivot = new THREE.Group()
      pivot.rotation.y = (j / prm.petals) * Math.PI * 2 + (i * Math.PI) / prm.petals
      const mesh = new THREE.Mesh(geos[j % geos.length], petalMat)
      mesh.rotation.x = CLOSED_TILT
      // 파형 윤곽 = 꽃잎별 길이 (feat/integrate의 lengths, 바깥 겹에서 가장 뚜렷하게)
      const L = clamp(f.lengths?.[j] ?? 1, 0.4, 1.6)
      mesh.scale.y = 1 + (L - 1) * (1 - i * 0.35)
      pivot.add(mesh)
      layer.add(pivot)
      petals.push({ mesh, openTilt: 1.4 - i * 0.42, delay: i * 0.15 })
    }
    head.add(layer)
  }

  // Keep the center's color and shape visible under the shared scene lighting.
  const centerR = 0.05 + 0.04 * prm.size
  const centerColor = bases[0].clone().lerp(new THREE.Color('#fff4c2'), 0.75)
  const center = new THREE.Mesh(
    new THREE.SphereGeometry(centerR, 14, 12),
    new THREE.MeshStandardMaterial({ color: centerColor, roughness: 0.42, emissive: centerColor, emissiveIntensity: 0.15 }),
  )
  center.position.y = centerR * 0.4
  head.add(center)
  const nStamen = Math.max(5, prm.petals)
  const stamenGeo = new THREE.SphereGeometry(centerR * 0.22, 6, 6)
  for (let k = 0; k < nStamen; k++) {
    const a = (k / nStamen) * Math.PI * 2
    const s = new THREE.Mesh(stamenGeo, stamenMat)
    s.position.set(Math.cos(a) * centerR * 1.25, centerR * 0.9, Math.sin(a) * centerR * 1.25)
    head.add(s)
  }
  g.add(head)

  g.traverse((o) => { if (o.isMesh) o.castShadow = true })
  g.userData.headY = h
  g.userData.head = head
  g.userData.setOpen = (p) => {
    for (const pt of petals) {
      const lp = easeOutBack(clamp((p - pt.delay) / (1 - pt.delay), 0, 1))
      pt.mesh.rotation.x = CLOSED_TILT + (pt.openTilt - CLOSED_TILT) * lp
    }
  }
  g.userData.setOpen(0)
  return g
}

export function disposeFlower3D(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose()
    if (o.material) o.material.dispose()
  })
}
