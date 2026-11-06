// 절차 생성 3D 꽃 (three.js). feat/3d의 Flower3D(R3F)를 이 앱 구조에 맞게 옮긴 것.
// PRD 4.4: 꽃잎 수 = onset, 양성모음 = 작고 2겹 / 음성모음 = 크고 3겹,
//          된소리·거센소리 = 뾰족한 꽃잎, 음량 = 크기·중심 발광, 색 = 카테고리 계열(naming.js에서 모음 톤까지 반영됨)
import * as THREE from 'three'
import { AQUA, BLUSH, LAVENDER, PEARL, opalMaterial } from './crystalFlora.js'

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const easeOutBack = (x) => {
  const c1 = 1.3, c3 = c1 + 1
  return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2
}
const CLOSED_TILT = 0.12   // 봉오리일 때 꽃잎 기울기(0 = 똑바로 위)
const CHAMPAGNE = new THREE.Color('#d39e73')

// 'hsl(335 70% 80%)', 'hsl(335, 70%, 80%)', '#ff9ec7' 모두 처리
export function toColor(input, fallback = '#f0a0c0') {
  const c = new THREE.Color()
  const m = /hsl\(\s*([\d.]+)[\s,]+([\d.]+)%[\s,]+([\d.]+)%/.exec(input || '')
  if (m) return c.setHSL(+m[1] / 360, +m[2] / 100, +m[3] / 100, THREE.SRGBColorSpace)
  try { return c.set(input || fallback) } catch { return c.set(fallback) }
}

// 감정 꽃 7종 (사람 목소리, flower.js의 CATEGORIES id). 꽃 종류는 감정이 정하고,
// 크기는 음량, 색은 감정 색(flower.js), 꽃잎 수·길이는 리듬(onset)·파형(lengths)이 정한다.
//  petalMul 꽃잎 배수 · layers 겹 · width 꽃잎 폭(길이 대비) · pointy 끝 뾰족 · notch 하트 홈
//  open 바깥 겹이 펴지는 각도 · layerStep 안쪽 겹마다 덜 펴짐 · cup 오목함 · curl 끝 말림(음수 = 뒤로 젖힘)
//  len 꽃잎 길이 배율 · center 가운데 크기 배율 · stem 줄기 길이 배율 · twist 꽃잎 비틀림 · droop 고개 숙임 · shiver 떨림
export const EMOTION_SHAPES = {
  joy:     { label: '해바라기형', petalMul: 2, layers: 1, width: 0.2, pointy: false, open: 1.5, cup: 0.2, curl: 0.05, len: 1.05, center: 1.9, centerColor: '#8a5a2b' },
  excited: { label: '별·불꽃형', petalMul: 1, layers: 2, width: 0.26, pointy: true, open: 1.65, layerStep: 0.3, cup: 0.3, curl: -0.18, len: 1.05, twist: 0.35 },
  flutter: { label: '튤립형', petalMul: 1, layers: 2, width: 0.5, pointy: false, notch: 0.22, open: 0.7, layerStep: 0.25, cup: 0.75, curl: 0.1, len: 0.95 },
  cozy:    { label: '작약형', petalMul: 1, layers: 4, width: 0.6, pointy: false, open: 1.45, layerStep: 0.3, cup: 0.7, curl: 0.3, len: 0.85 },
  calm:    { label: '연꽃형', petalMul: 1, layers: 3, width: 0.38, pointy: true, open: 1.25, layerStep: 0.33, cup: 0.6, curl: 0.12, len: 1, stem: 0.55 },
  sad:     { label: '초롱꽃형', petalMul: 1, layers: 1, width: 0.5, pointy: false, open: 0.5, cup: 0.9, curl: -0.4, len: 1.05, droop: 2.3, center: 0.6 },
  tense:   { label: '엉겅퀴형', petalMul: 2, layers: 2, width: 0.11, pointy: true, open: 1.05, layerStep: 0.22, cup: 0.15, curl: 0, len: 0.95, shiver: 1 },
}
// 감정이 없는 꽃(우리의 꽃, 예전 데이터)
const DEFAULT_SHAPE = { petalMul: 1, width: null, open: 1.4, layerStep: 0.42, cup: 0.5, curl: 0.25, len: 1, center: 1, stem: 1 }

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

// A shallow keel and beveled margins give the curved petal distinct reflecting planes.
function petalGeometry({ pointy, length, width, baseColor, tipColor, edgeColor, cup = 0.5, curl = 0.25, notch = 0 }) {
  const U = 12
  const across = [-1, -0.78, -0.38, 0, 0.38, 0.78, 1]
  const pos = [], col = [], idx = []
  const body = new THREE.Color()
  const tint = new THREE.Color()
  for (let i = 0; i <= U; i++) {
    const u = i / U
    const hw = pointy
      ? width * Math.sin(Math.PI * u ** 0.6)
      : width * Math.sin(Math.PI * u ** 0.85) ** 0.6
    body.copy(baseColor).lerp(tipColor, u ** 0.7)
    for (const v of across) {
      // notch: 꽃잎 끝 가운데를 살짝 파서 하트 모양으로
      const y = u * length * (1 - notch * (1 - v * v) * u ** 6)
      const side = Math.abs(v)
      const cut = 0.22 * side + 0.55 * Math.max(0, side - 0.78)
      pos.push(v * hw, y, -(cup * v * v + cut) * hw - curl * u * u * length)
      tint.copy(body).lerp(edgeColor, 0.58 * side ** 5 + 0.13 * u ** 4)
      tint.multiplyScalar(1 + 0.07 * v)
      col.push(tint.r, tint.g, tint.b)
    }
  }
  for (let i = 0; i < U; i++) {
    for (let j = 0; j < across.length - 1; j++) {
      const a = i * across.length + j, b = a + across.length
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
  const shape = (!pair && EMOTION_SHAPES[f.category]) || DEFAULT_SHAPE
  if (!pair && EMOTION_SHAPES[f.category]) {
    prm.petals = Math.round(clamp(prm.petals * shape.petalMul, 3, 16))
    prm.layers = shape.layers
    if (shape.pointy !== undefined) prm.pointy = shape.pointy
  }
  const stemMat = new THREE.MeshStandardMaterial({ color: '#56888d', roughness: 0.43, metalness: 0.16, flatShading: true })
  const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.39, metalness: 0.13 })
  const stamenMat = new THREE.MeshStandardMaterial({ color: '#e5b995', roughness: 0.34, metalness: 0.24 })
  if (pair) Object.assign(prm, { layers: 3, size: 0.85 })
  const g = new THREE.Group()

  // 줄기 + 잎
  const h = (0.45 + prm.size * 0.25) * (shape.stem ?? 1)
  const droop = shape.droop ?? 0
  // 고개 숙인 꽃(초롱꽃형)은 줄기 끝이 앞으로 휘어 꽃송이가 매달린다
  const tip = new THREE.Vector3(0, h, droop ? 0.1 : 0)
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.03, h * 0.3, 0.02),
    new THREE.Vector3(-0.02, h * 0.7, droop ? 0.02 : 0),
    tip,
  ])
  const stem = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.016, 5, false), stemMat)
  g.add(stem)
  const leafGeo = petalGeometry({
    pointy: true, length: 0.22, width: 0.07, cup: 0.4, curl: -0.2,
    baseColor: new THREE.Color('#54858f'), tipColor: AQUA, edgeColor: PEARL,
  })
  const leaf = new THREE.Mesh(leafGeo, leafMat)
  leaf.position.set(0.01, h * 0.3, 0)
  leaf.rotation.set(1.0, 0.6, 0)
  g.add(leaf)

  // 꽃송이
  const head = new THREE.Group()
  head.position.copy(tip)
  head.rotation.x = droop
  const bases = colors.map((c) => toColor(c))
  const blend = pair && bases[1] ? bases[0].clone().lerp(bases[1], 0.5) : bases[0]
  const petalMat = opalMaterial({ side: THREE.DoubleSide })
  const petals = []   // { mesh, openTilt, delay }
  for (let i = 0; i < prm.layers; i++) {
    const length = 0.42 * prm.size * (1 - i * 0.2) * (shape.len ?? 1)
    const width = length * (shape.width ?? (prm.pointy ? 0.3 : 0.4))
    const geos = bases.map((c, j) => petalGeometry({
      pointy: prm.pointy, length, width, cup: shape.cup, curl: shape.curl, notch: shape.notch ?? 0,
      baseColor: c.clone().lerp(blend, pair ? 0.24 : 0).lerp(LAVENDER, 0.20 + i * 0.04),
      tipColor: c.clone().lerp(PEARL, 0.36),
      edgeColor: PEARL.clone().lerp(j % 2 ? AQUA : BLUSH, 0.35),
    }))
    const layer = new THREE.Group()
    layer.position.y = i * 0.012
    for (let j = 0; j < prm.petals; j++) {
      const pivot = new THREE.Group()
      pivot.rotation.y = (j / prm.petals) * Math.PI * 2 + (i * Math.PI) / prm.petals
      const mesh = new THREE.Mesh(geos[j % geos.length], petalMat)
      mesh.rotation.x = CLOSED_TILT
      if (shape.twist) mesh.rotation.z = (j % 2 ? 1 : -1) * shape.twist * 0.5
      // 파형 윤곽 = 꽃잎별 길이 (feat/integrate의 lengths, 바깥 겹에서 가장 뚜렷하게)
      const L = clamp(f.lengths?.[j] ?? 1, 0.4, 1.6)
      mesh.scale.y = 1 + (L - 1) * (1 - i * 0.35)
      pivot.add(mesh)
      layer.add(pivot)
      petals.push({ mesh, openTilt: shape.open - i * (shape.layerStep ?? 0.42), delay: i * 0.15 })
    }
    head.add(layer)
  }

  // Champagne stamens frame a darker faceted core, so the center reads in bright light.
  const baseR = 0.05 + 0.04 * prm.size
  const centerR = baseR * (shape.center ?? 1)
  const centerColor = shape.centerColor ? new THREE.Color(shape.centerColor).lerp(CHAMPAGNE, 0.35) : blend.clone().lerp(CHAMPAGNE, 0.48)
  const center = new THREE.Mesh(
    new THREE.IcosahedronGeometry(centerR, 1),
    new THREE.MeshStandardMaterial({ color: centerColor, roughness: 0.37, metalness: 0.14, flatShading: true }),
  )
  center.position.y = centerR * 0.4
  head.add(center)
  const nStamen = Math.max(5, prm.petals)
  const stamenGeo = new THREE.OctahedronGeometry(baseR * 0.25)
  stamenGeo.scale(0.8, 1.3, 0.8)
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
  // 떨림(긴장·엉겅퀴형): 정원·미리보기가 매 프레임 tick(t)을 부른다
  g.userData.tick = shape.shiver
    ? (t) => { head.rotation.z = Math.sin(t * 38) * 0.035 * (0.6 + 0.4 * Math.sin(t * 1.7)) }
    : null
  return g
}

export function disposeFlower3D(obj) {
  if (obj.userData.dispose) return obj.userData.dispose()
  const resources = new Set()
  obj.traverse((o) => {
    if (o.geometry) resources.add(o.geometry)
    if (o.material) resources.add(o.material)
  })
  for (const resource of resources) resource.dispose()
}
