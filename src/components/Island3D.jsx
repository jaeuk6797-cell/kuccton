// 떠 있는 정원 섬 (three.js). 상대 꽃은 왼쪽, 내 꽃은 오른쪽, 우리의 꽃은 가운데에 핀다.
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { buildFlower3D, disposeFlower3D } from '../lib/flower3d.js'
import { buildTree3D } from '../lib/tree3d.js'
import { createGardenEnvironment } from '../lib/gardenEnvironment.js'
import { isTree } from '../lib/tree.js'
import { playbackLevel } from '../lib/audio.js'

// 블렌더 섬 모델: public/models/island.glb 를 올리면 코드로 만든 섬 대신 자동으로 쓴다.
// 약속: 원점 = 섬 윗면 중앙, Y-up, Draco 압축 가능. 크기는 지름이 ISLAND_RADIUS*2가 되도록 자동 맞춤.
const ISLAND_GLB = `${import.meta.env.BASE_URL}models/island.glb`
const ISLAND_RADIUS = 4
const ISLAND_TOP_Y = 0.17

// 카메라: 기본은 섬 전체 보기, 필요한 경우 약 33% 확대 허용
const CAMERA = { position: [0, 4.4, 10.5], target: [0, 0.1, 0], fov: 36, max: 17 }
// 섬 가장자리와 아래 바위까지 들어오는 반지름(여백 포함)
const FIT_RADIUS = 4.4

// 빛 알갱이: 소리를 재생하면 음량에 맞춰 커지고 빨라지고 따뜻한 색이 된다
const SPARKLE = { size: 0.06, speed: 0.004, sizeBoost: 4, speedBoost: 8 }
const SPARKLE_IDLE = new THREE.Color('#ffffff')
const SPARKLE_PLAY = new THREE.Color('#ffd23f')

function rng(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function hash(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619)
  return h >>> 0
}
function cssColor(str, fallback = '#f0a0c0') {
  const m = /hsl\(\s*([\d.]+)[\s,]+([\d.]+)%[\s,]+([\d.]+)%/.exec(str || '')
  if (!m) return new THREE.Color(fallback)
  return new THREE.Color().setHSL(+m[1] / 360, +m[2] / 100, +m[3] / 100, THREE.SRGBColorSpace)
}
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, ...extra })

function disposeMeshes(root) {
  const resources = new Set()
  root.traverse((object) => {
    if (object.geometry) resources.add(object.geometry)
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of materials) {
      if (!material) continue
      resources.add(material)
      for (const value of Object.values(material)) if (value?.isTexture) resources.add(value)
    }
  })
  for (const resource of resources) resource.dispose()
}

function applyOpalReflection(material) {
  if (material.name !== 'SUP Opalescent ground' || material.userData.opalReflection) return
  material.userData.opalReflection = true
  // Native thin-film shading added measured cost without a visible gain over this angular scatter.
  material.iridescence = 0
  const previousCompile = material.onBeforeCompile
  material.onBeforeCompile = function (shader, renderer) {
    previousCompile.call(this, shader, renderer)
    // Opaque mineral scatter changes with reflected sky direction, never UVs or time.
    // Direct light, contact shadows and the native clearcoat remain unmodified.
    shader.fragmentShader = shader.fragmentShader.replace('#include <aomap_fragment>', `
      #include <aomap_fragment>
      vec3 opalReflection = transformDirectionByInverseViewMatrix(
        reflect(-geometryViewDir, geometryNormal), viewMatrix);
      float opalEdge = 1.0 - saturate(dot(geometryNormal, geometryViewDir));
      float opalGrazing = opalEdge * opalEdge;
      // These nonnegative circular weights sum to one without angular seams or hue plateaus.
      vec3 opalWeights = vec3(
        1.0 - opalReflection.z,
        1.0 + 0.8660254 * opalReflection.x + 0.5 * opalReflection.z,
        1.0 - 0.8660254 * opalReflection.x + 0.5 * opalReflection.z) / 3.0;
      vec3 opalTint = opalWeights.x * vec3(0.72, 1.12, 1.14)
        + opalWeights.y * vec3(1.18, 0.78, 1.03)
        + opalWeights.z * vec3(1.14, 0.76, 1.18);
      // A quiet pearl body persists while reflected color strengthens toward grazing views.
      reflectedLight.indirectDiffuse *= mix(vec3(0.92, 1.02, 1.04), opalTint,
        0.55 + 0.20 * opalGrazing);
      reflectedLight.indirectSpecular *= mix(vec3(1.0), opalTint, 0.70 + 0.25 * opalGrazing);
      // Upper viewing directions retain a polished response without brightening diffuse light.
      float opalUpperView = smoothstep(0.45, 0.78, opalReflection.y);
      // Exact maximum of four cardinal upper lobes, evaluated with scalar arithmetic.
      float opalUpperLobe = max(0.0, 0.8 * opalReflection.y
        + 0.6 * max(abs(opalReflection.x), abs(opalReflection.z)));
      float opalUpperLobe2 = opalUpperLobe * opalUpperLobe;
      float opalUpperLobe4 = opalUpperLobe2 * opalUpperLobe2;
      float opalUpperHighlight = opalUpperLobe4 * opalUpperLobe4 * opalUpperLobe4;
      reflectedLight.indirectSpecular *= 1.0 + 31.0 * opalUpperView * opalUpperHighlight;
    `)
  }
  material.customProgramCacheKey = () => 'soop-opal-reflection-v3'
  material.needsUpdate = true
}

function jitter(geo, amount, rand, keep = () => false) {
  const p = geo.attributes.position
  const seen = new Map()
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`
    if (keep(p.getX(i), p.getY(i), p.getZ(i))) continue
    if (!seen.has(key)) seen.set(key, [(rand() - 0.5) * amount, (rand() - 0.5) * amount * 0.6, (rand() - 0.5) * amount])
    const d = seen.get(key)
    p.setXYZ(i, p.getX(i) + d[0], p.getY(i) + d[1], p.getZ(i) + d[2])
  }
  geo.computeVertexNormals()
  return geo
}


function buildIsland() {
  const rand = rng(20261106)
  const root = new THREE.Group()

  const grass = new THREE.Mesh(jitter(new THREE.CylinderGeometry(4, 3.9, 0.35, 30, 1), 0.25, rand, (x, y) => y > 0 && Math.hypot(x) < 0), mat('#86b85c'))
  grass.receiveShadow = true
  root.add(grass)

  const dirt = new THREE.Mesh(jitter(new THREE.CylinderGeometry(3.95, 3.6, 0.5, 30, 1), 0.2, rand), mat('#6e4b33'))
  dirt.position.y = -0.4
  root.add(dirt)

  const rockGeo = new THREE.ConeGeometry(3.6, 3.4, 16, 5)
  rockGeo.rotateX(Math.PI)
  const rock = new THREE.Mesh(jitter(rockGeo, 0.7, rand, (x, y) => y > 1.6), mat('#857565'))
  rock.position.y = -2.35
  root.add(rock)

  // 잔디 위 작은 돌, 풀 무더기
  for (let i = 0; i < 6; i++) {
    const a = rand() * Math.PI * 2, r = 1 + rand() * 2.6
    const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.08 + rand() * 0.12), mat('#a39a8f'))
    s.position.set(Math.cos(a) * r, 0.2, Math.sin(a) * r)
    s.castShadow = true
    root.add(s)
  }
  const tuftMat = mat('#9ccc6a')
  for (let i = 0; i < 90; i++) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * 3.8
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.18 + rand() * 0.12, 3), tuftMat)
    t.position.set(Math.cos(a) * r, 0.25, Math.sin(a) * r)
    root.add(t)
  }

  // 장식용 숲은 두지 않는다: 섬 위에는 주고받은 소리로 핀 꽃과 소리 나무만 자란다
  return root
}

function loadIslandGlb(target) {
  let disposed = false
  const draco = new DRACOLoader()
  draco.setDecoderPath(`${import.meta.env.BASE_URL}draco/`)
  const loader = new GLTFLoader()
  loader.setDRACOLoader(draco)
  loader.load(
    ISLAND_GLB,
    (gltf) => {
      const model = gltf.scene
      if (disposed) {
        disposeMeshes(model)
        return
      }
      const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3())
      model.scale.setScalar((ISLAND_RADIUS * 2) / Math.max(size.x, size.z, 0.001))
      model.position.y = ISLAND_TOP_Y
      model.traverse((o) => {
        if (!o.isMesh) return
        const materials = Array.isArray(o.material) ? o.material : [o.material]
        for (const material of materials) applyOpalReflection(material)
        const transparent = materials.some((material) => material.transparent)
        // Alpha crystals keep their transmitted appearance; only solid perimeter details cast shadows.
        o.castShadow = !transparent && /Island_(Ornamental_Ring|Vegetation)/.test(o.name)
        o.receiveShadow = !transparent && /Island_(Surface|Pond|Accents|Vegetation)/.test(o.name)
      })
      disposeMeshes(target)
      target.clear()
      target.add(model)
      draco.dispose()
    },
    undefined,
    () => draco.dispose(), // 모델이 없거나 읽을 수 없으면 코드로 만든 섬을 그대로 둔다
  )
  return () => {
    disposed = true
    draco.dispose()
  }
}

// ───────── 꽃 자리 ─────────
// 섬 위에 벌집 모양 자리(슬롯)를 미리 깔고 살짝 흔들어 둔다. 장식(거울 고리·수정 결정·연못)이 있는 곳은 비운다.
// 반지름 3.4 · 간격 0.66 → 자리 약 69개: 받은 소리 50송이(정원 최대)와 우리의 꽃이 겹치지 않거나 살짝만 닿는다.
// 장식 위치는 public/models/island.glb를 앱과 같은 크기로 불러와 잰 값 (섬 반지름 4 기준)
const FLOWER_FIELD_RADIUS = 3.4
const SLOT_GAP = 0.66
const DECOR = [
  [-0.69, -3.06, 0.95], // 거울 고리
  [-2.81, -0.74, 0.8], // 수정 결정 (왼쪽)
  [2.39, -2.2, 0.75], // 수정 결정 (오른쪽 뒤)
  [0.69, -3.23, 0.6], // 수정 결정 (뒤)
  [3.0, 0.89, 0.8], // 연못
]
const SLOTS = (() => {
  const out = []
  const dz = SLOT_GAP * Math.sqrt(3) / 2
  for (let row = -12; row <= 12; row++) {
    for (let col = -12; col <= 12; col++) {
      const r = rng(hash(`slot-${row}-${col}`))
      const x = col * SLOT_GAP + (row & 1 ? SLOT_GAP / 2 : 0) + (r() - 0.5) * 0.12
      const z = row * dz + (r() - 0.5) * 0.12
      if (Math.hypot(x, z) > FLOWER_FIELD_RADIUS) continue
      if (DECOR.some(([cx, cz, rad]) => Math.hypot(x - cx, z - cz) < rad + 0.2)) continue
      out.push({ x, z })
    }
  }
  return out
})()
// 우리의 꽃(더 크다)은 앞쪽 가운데를 먼저 쓰고, 둘레 자리까지 막아 둔다
const PAIR_HOME = { x: 0, z: 1.1 }

// items: [{ key, kind, t }] → 위치 [{ x, z }] (items 순서 그대로)
// 먼저 생긴 것부터 자리를 잡으므로, 새 꽃이 생겨도 이미 핀 꽃은 움직이지 않는다.
function placeFlowers(items) {
  const taken = new Array(SLOTS.length).fill(false)
  const result = new Array(items.length)
  const order = items.map((it, i) => i).sort((a, b) => String(items[a].t || '').localeCompare(String(items[b].t || '')) || a - b)
  const nearestFree = (x, z) => {
    let best = -1, bd = Infinity
    SLOTS.forEach((sl, k) => {
      if (taken[k]) return
      const d = Math.hypot(sl.x - x, sl.z - z)
      if (d < bd) { bd = d; best = k }
    })
    return best
  }
  for (const i of order) {
    const it = items[i]
    const target = it.kind === 'pair' ? PAIR_HOME : SLOTS[hash(it.key) % SLOTS.length]
    let k = nearestFree(target.x, target.z)
    if (k < 0) k = hash(it.key) % SLOTS.length // 자리가 모두 찼으면(정원 최대를 넘으면) 겹쳐서라도 심는다
    taken[k] = true
    if (it.kind === 'pair') {
      SLOTS.forEach((sl, m) => { if (Math.hypot(sl.x - SLOTS[k].x, sl.z - SLOTS[k].z) < SLOT_GAP * 1.05) taken[m] = true })
    }
    result[i] = { x: SLOTS[k].x, z: SLOTS[k].z }
  }
  return result
}

// flowers: 우리의 꽃을 만들 때 찾을 수 있도록 내 꽃까지 전부 받는다. 섬에는 받은 꽃(meId가 아닌 꽃)과 우리의 꽃만 핀다.
// visibleIds: 쉼표로 이은 id 목록(친구별 보기). 위치는 항상 전체 기준으로 정하고 여기 없는 것만 숨겨서,
//             친구를 바꿔 봐도 꽃 자리가 움직이지 않는다. 없으면 모두 보인다.
// 친구별 보기: 고른 친구의 꽃만 또렷하게, 나머지는 색을 빼고 반투명하게
const DIM_GREY = new THREE.Color('#c9c4d6')
function dimObject(obj) {
  const materials = new Set()
  obj.traverse((o) => {
    if (!o.isMesh) return
    materials.add(o.material)
    o.castShadow = false
  })
  // Each plant owns its materials. All petals or facets on that plant can stay on the same material.
  for (const material of materials) {
    material.transparent = true
    material.opacity = 0.22
    material.color.lerp(DIM_GREY, 0.55)
  }
}

export default function Island3D({ flowers, pairs, meId, freshIds, highlightId, visibleIds, onPickFlower, onPickPair, resetViewKey }) {
  const wrapRef = useRef(null)
  const stateRef = useRef(null)
  const cbRef = useRef({})
  cbRef.current = { onPickFlower, onPickPair }

  // 장면은 한 번만 만든다
  useEffect(() => {
    const wrap = wrapRef.current
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)) // 빛 번짐 후처리 비용 때문에 1.5로 제한
    // OutputPass applies this display transform once, after the linear scene render.
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.NeutralToneMapping
    renderer.toneMappingExposure = 1
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    wrap.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const environment = createGardenEnvironment(renderer)
    scene.environment = environment.texture
    scene.environmentIntensity = 0.55
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100)
    camera.position.set(...CAMERA.position)

    scene.add(new THREE.HemisphereLight('#ccd9f3', '#6c7d88', 0.38))
    const sun = new THREE.DirectionalLight('#fff1e8', 1.5)
    sun.position.set(5, 8, 5)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 0.5, far: 25 })
    sun.shadow.intensity = 0.55
    sun.shadow.radius = 3
    sun.shadow.normalBias = 0.025
    sun.shadow.bias = -0.0001
    scene.add(sun)
    const fill = new THREE.DirectionalLight('#a8dce4', 0.65)
    fill.position.set(-4, -1, 3)
    scene.add(fill)

    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    // 빛 번짐(bloom) 없이 그린다
    composer.addPass(new OutputPass())

    const floating = new THREE.Group()
    const islandGroup = new THREE.Group()
    islandGroup.add(buildIsland())
    floating.add(islandGroup)
    const stopIslandLoad = loadIslandGlb(islandGroup)
    const flowerLayer = new THREE.Group()
    flowerLayer.position.y = 0.17
    floating.add(flowerLayer)
    scene.add(floating)

    // 떠다니는 빛 알갱이
    const N = 140
    const pts = new Float32Array(N * 3)
    const r0 = rng(7)
    for (let i = 0; i < N; i++) pts.set([(r0() - 0.5) * 12, r0() * 7 - 1, (r0() - 0.5) * 10], i * 3)
    const pGeo = new THREE.BufferGeometry()
    pGeo.setAttribute('position', new THREE.BufferAttribute(pts, 3))
    const sparkleMat = new THREE.PointsMaterial({ color: '#ffffff', size: SPARKLE.size, transparent: true, opacity: 0.8 })
    const sparkles = new THREE.Points(pGeo, sparkleMat)
    let level = 0 // 부드럽게 따라가는 재생 음량
    scene.add(sparkles)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(...CAMERA.target)
    controls.enableDamping = true
    controls.enablePan = false
    controls.maxDistance = CAMERA.max
    controls.minPolarAngle = 0.55
    controls.maxPolarAngle = 1.4
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.35
    let resumeTimer
    controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(resumeTimer) })
    controls.addEventListener('end', () => { resumeTimer = setTimeout(() => (controls.autoRotate = true), 5000) })

    // 탭으로 꽃 고르기 (드래그와 구분)
    const ray = new THREE.Raycaster()
    let down = null
    const el = renderer.domElement
    const onDown = (e) => { down = { x: e.clientX, y: e.clientY } }
    const onUp = (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return
      const rect = el.getBoundingClientRect()
      ray.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), camera)
      const hit = ray.intersectObjects(flowerLayer.children, true)[0]
      let o = hit?.object
      while (o && !o.userData.kind) o = o.parent
      if (o?.userData.dimmed) return // 흐리게 된 꽃은 고를 수 없다
      if (o?.userData.kind === 'flower') cbRef.current.onPickFlower?.(o.userData.data)
      if (o?.userData.kind === 'pair') cbRef.current.onPickPair?.(o.userData.data)
    }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerup', onUp)

    const target = new THREE.Vector3(...CAMERA.target)
    const viewDir = new THREE.Vector3(...CAMERA.position).sub(target)
    const baseDist = viewDir.length()
    viewDir.normalize()
    const resize = () => {
      const { clientWidth: w, clientHeight: h } = wrap
      if (!w || !h) return
      renderer.setSize(w, h)
      composer.setSize(w, h)
      camera.aspect = w / h
      // 가로·세로 중 좁은 화각에 섬 전체를 맞춘다.
      camera.fov = CAMERA.fov
      const halfVertical = THREE.MathUtils.degToRad(CAMERA.fov) / 2
      const halfHorizontal = Math.atan(Math.tan(halfVertical) * camera.aspect)
      const dist = Math.max(baseDist, FIT_RADIUS / Math.sin(Math.min(halfVertical, halfHorizontal)))
      // 처음에는 전체를 보여 주고, 필요하면 약 33%까지 가까이 볼 수 있다.
      controls.minDistance = dist * 0.75
      controls.maxDistance = Math.max(CAMERA.max, dist + 3)
      controls.target.copy(target)
      camera.position.copy(target).addScaledVector(viewDir, dist)
      camera.updateProjectionMatrix()
      controls.update()
      controls.saveState()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)
    resize()

    const clock = new THREE.Clock()
    let raf
    const loop = () => {
      const t = clock.getElapsedTime()
      floating.position.y = Math.sin(t * 0.6) * 0.08
      level += (playbackLevel() - level) * 0.15
      sparkleMat.size = SPARKLE.size * (1 + level * SPARKLE.sizeBoost)
      sparkleMat.opacity = 0.8 + level * 0.2
      sparkleMat.color.copy(SPARKLE_IDLE).lerp(SPARKLE_PLAY, Math.min(1, level * 1.5))
      const rise = SPARKLE.speed * (1 + level * SPARKLE.speedBoost)
      const p = pGeo.attributes.position
      for (let i = 0; i < N; i++) {
        let y = p.getY(i) + rise
        if (y > 6) y = -1
        p.setY(i, y)
      }
      p.needsUpdate = true
      for (const f of flowerLayer.children) {
        const u = f.userData
        const age = t - (u.bornAt ?? -10)
        const grow = Math.min(1, Math.max(0, age / 1.2))
        const e = 1 - Math.pow(1 - grow, 3)
        // 하이라이트(오늘의 위로·새로 핀 꽃)는 빛 대신 살짝 커졌다 작아진다
        const pulse = u.highlight || u.fresh ? 1 + Math.sin(t * 4) * 0.08 : 1
        f.scale.setScalar(u.size * Math.max(0.001, 0.3 + 0.7 * e) * pulse)
        // 꽃잎이 바깥 겹부터 펼쳐진다 (다 피면 더 계산하지 않음)
        if (!u.opened && u.setOpen) {
          const open = Math.min(1, Math.max(0, age / 1.8))
          u.setOpen(open)
          if (open >= 1) u.opened = true
        }
        u.tick?.(t) // 감정 꽃의 움직임 (긴장 = 바르르 떨림)
        f.rotation.z = Math.sin(t * 1.3 + u.phase) * 0.05
      }
      controls.update()
      composer.render()
      raf = requestAnimationFrame(loop)
    }
    loop()

    stateRef.current = {
      flowerLayer, clock, known: new Set(), first: true,
      resetView: () => {
        clearTimeout(resumeTimer)
        controls.autoRotate = false
        controls.reset()
        resumeTimer = setTimeout(() => (controls.autoRotate = true), 5000)
      },
    }
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(resumeTimer)
      ro.disconnect()
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerup', onUp)
      controls.dispose()
      stopIslandLoad()
      disposeMeshes(scene)
      scene.environment = null
      environment.dispose()
      sun.shadow.dispose()
      for (const pass of composer.passes) pass.dispose()
      composer.dispose()
      renderer.dispose()
      wrap.removeChild(el)
      stateRef.current = null
    }
  }, [])

  useEffect(() => {
    if (resetViewKey != null) stateRef.current?.resetView()
  }, [resetViewKey])

  // 꽃 데이터가 바뀌면 꽃 층만 다시 만든다
  useEffect(() => {
    const st = stateRef.current
    if (!st) return
    const { flowerLayer, clock, known } = st
    for (const c of [...flowerLayer.children]) { flowerLayer.remove(c); disposeFlower3D(c) }

    const byId = Object.fromEntries(flowers.map((f) => [f.id, f]))
    const pairedIds = new Set()
    const items = []
    for (const p of pairs) {
      const a = byId[p.flower_a_id], b = byId[p.flower_b_id]
      if (!a || !b) continue
      pairedIds.add(a.id); pairedIds.add(b.id)
      const at = (f) => f.shared_at || f.created_at || ''
      items.push({ key: p.id, kind: 'pair', data: p, a, b, t: [at(a), at(b)].sort().pop() })
    }
    // 내 꽃은 내 정원에 피지 않는다(우리의 꽃 재료로만 쓴다). 받은 꽃은 id로 정해진 자리 근처에
    for (const f of flowers) {
      if (f.sender_id === meId) continue
      items.push({ key: f.id, kind: 'flower', data: f, t: f.shared_at || f.created_at })
    }
    const pos = placeFlowers(items) // 항상 전체 기준 → 친구별로 숨겨도 자리 고정
    // 섬에 핀 수가 많을수록 조금씩 작게: 12송이까지는 그대로, 50송이면 약 0.6배 (구별은 되게 자리 간격 0.66에 맞춤)
    const density = Math.max(0.58, Math.min(1, Math.sqrt(12 / Math.max(items.length, 1))))
    const visible = visibleIds == null ? null : new Set(visibleIds ? visibleIds.split(',') : [])
    const now = clock.getElapsedTime()

    items.forEach((it, i) => {
      const obj = it.kind === 'pair'
        ? buildFlower3D({ ...it.b, petals: Math.min(8, Math.max(it.a.petals, it.b.petals) + 1) }, [it.a.color, it.b.color], { pair: true })
        : isTree(it.data) ? buildTree3D(it.data) : buildFlower3D(it.data, [it.data.color])
      obj.position.set(pos[i].x, 0, pos[i].z)
      const isNew = !known.has(it.key)
      Object.assign(obj.userData, {
        kind: it.kind,
        data: it.data,
        size: (it.kind === 'pair' ? 2.6 : isTree(it.data) ? 1.55 : 1.8) * density, // 나무는 키가 커서 조금 더 작게
        phase: (hash(it.key) % 100) / 16,
        bornAt: isNew ? (st.first ? now + i * 0.06 : now) : -10,
        fresh: freshIds?.has(it.key),
        highlight: highlightId === it.key,
        dimmed: Boolean(visible && !visible.has(it.key)),
      })
      if (obj.userData.dimmed) dimObject(obj)
      known.add(it.key)
      flowerLayer.add(obj)
    })
    st.first = false
  }, [flowers, pairs, meId, freshIds, highlightId, visibleIds])

  return <div ref={wrapRef} className="island" />
}
