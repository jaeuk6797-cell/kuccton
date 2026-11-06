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
import { isTree } from '../lib/tree.js'
import { playbackLevel } from '../lib/audio.js'

// 블렌더 섬 모델: public/models/island.glb 를 올리면 코드로 만든 섬 대신 자동으로 쓴다.
// 약속: 원점 = 섬 윗면 중앙, Y-up, Draco 압축 가능. 크기는 지름이 ISLAND_RADIUS*2가 되도록 자동 맞춤.
const ISLAND_GLB = `${import.meta.env.BASE_URL}models/island.glb`
const ISLAND_RADIUS = 4
const ISLAND_TOP_Y = 0.17

// 카메라: 꽃이 모여 있는 섬 가운데(반지름 약 2)를 가깝게 본다
const CAMERA = { position: [0, 4.4, 10.5], target: [0, 0.1, 0], fov: 36, min: 6, max: 17 }
// 화면이 좁으면(폰 세로) 이 반지름(섬)이 가로로 다 들어오도록 카메라를 뒤로 뺀다
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

function createGardenEnvironment(renderer) {
  // Capture broad pastel sky reflections once; only the filtered cubemap is sampled each frame.
  const studio = new THREE.Scene()
  studio.background = new THREE.Color('#69788b')
  const geometry = new THREE.PlaneGeometry(1, 1)
  for (const [position, size, color, intensity] of [
    [[-3, 4, 5], [6.5, 5.5], '#f5c8df', 1.7],
    [[5, 2, 2], [5, 6], '#b9e7f0', 1.7],
    [[-4, 3, -4], [7, 4.5], '#c6b7ec', 1.55],
    [[0, 5, -1], [5, 5], '#c5ece5', 1.45],
  ]) {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(intensity), toneMapped: false,
    })
    const panel = new THREE.Mesh(geometry, material)
    panel.position.set(...position)
    panel.scale.set(size[0], size[1], 1)
    panel.lookAt(0, 0, 0)
    studio.add(panel)
  }
  const generator = new THREE.PMREMGenerator(renderer)
  // A small angular blur softens light-card edges without adding a realtime render pass.
  const environment = generator.fromScene(studio, 0.14, 0.1, 30, { size: 256 })
  generator.dispose()
  disposeMeshes(studio)
  return environment
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

function placeFlowers(items) {
  // items: [{ key, side: -1|0|1 }] → 위치. 정원 가운데(r<1.9)에 겹치지 않게
  const placed = []
  return items.map(({ key, side }) => {
    const rand = rng(hash(key))
    let best = null
    for (let t = 0; t < 40; t++) {
      const x = side === 0 ? (rand() - 0.5) * 1.0 : side * (0.45 + rand() * 1.6)
      const z = side === 0 ? 0.3 + rand() * 1.2 : (rand() - 0.25) * 3.4
      if (Math.hypot(x, z) > 2.15) continue
      const d = Math.min(9, ...placed.map((p) => Math.hypot(p.x - x, p.z - z)))
      if (!best || d > best.d) best = { x, z, d }
      if (d > (side === 0 ? 1.0 : 0.75)) break
    }
    best ||= { x: side, z: 0 }
    placed.push(best)
    return best
  })
}

// flowers: 우리의 꽃을 만들 때 찾을 수 있도록 내 꽃까지 전부 받는다. 섬에는 받은 꽃(meId가 아닌 꽃)과 우리의 꽃만 핀다.
// visibleIds: 쉼표로 이은 id 목록(친구별 보기). 위치는 항상 전체 기준으로 정하고 여기 없는 것만 숨겨서,
//             친구를 바꿔 봐도 꽃 자리가 움직이지 않는다. 없으면 모두 보인다.
export default function Island3D({ flowers, pairs, meId, freshIds, highlightId, visibleIds, onPickFlower, onPickPair }) {
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
    renderer.toneMapping = THREE.ACESFilmicToneMapping
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
    controls.minDistance = CAMERA.min
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
      renderer.setSize(w, h)
      composer.setSize(w, h)
      camera.aspect = w / h
      // 화면이 좁을수록 카메라를 뒤로 빼서 섬 양옆이 잘리지 않게 한다 (화각은 그대로 → 왜곡 없음)
      camera.fov = CAMERA.fov
      const halfH = Math.atan(Math.tan(THREE.MathUtils.degToRad(CAMERA.fov) / 2) * camera.aspect)
      const dist = Math.max(baseDist, FIT_RADIUS / Math.sin(halfH))
      camera.position.copy(target).addScaledVector(viewDir, dist)
      controls.maxDistance = Math.max(CAMERA.max, dist + 3)
      camera.updateProjectionMatrix()
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

    stateRef.current = { flowerLayer, clock, known: new Set(), first: true }
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
      items.push({ key: p.id, side: 0, kind: 'pair', data: p, a, b })
    }
    // 내 꽃은 내 정원에 피지 않는다(우리의 꽃 재료로만 쓴다). 받은 꽃은 id로 정해진 쪽에 고르게
    for (const f of flowers) {
      if (f.sender_id === meId) continue
      items.push({ key: f.id, side: hash(f.id) % 2 ? 1 : -1, kind: 'flower', data: f })
    }
    const pos = placeFlowers(items) // 항상 전체 기준 → 친구별로 숨겨도 자리 고정
    const visible = visibleIds == null ? null : new Set(visibleIds ? visibleIds.split(',') : [])
    const now = clock.getElapsedTime()

    items.forEach((it, i) => {
      if (visible && !visible.has(it.key)) return
      const obj = it.kind === 'pair'
        ? buildFlower3D({ ...it.b, petals: Math.min(8, Math.max(it.a.petals, it.b.petals) + 1) }, [it.a.color, it.b.color], { pair: true })
        : isTree(it.data) ? buildTree3D(it.data) : buildFlower3D(it.data, [it.data.color])
      obj.position.set(pos[i].x, 0, pos[i].z)
      const isNew = !known.has(it.key)
      Object.assign(obj.userData, {
        kind: it.kind,
        data: it.data,
        size: it.kind === 'pair' ? 2.6 : 1.8,
        phase: (hash(it.key) % 100) / 16,
        bornAt: isNew ? (st.first ? now + i * 0.06 : now) : -10,
        fresh: freshIds?.has(it.key),
        highlight: highlightId === it.key,
      })
      known.add(it.key)
      flowerLayer.add(obj)
    })
    st.first = false
  }, [flowers, pairs, meId, freshIds, highlightId, visibleIds])

  return <div ref={wrapRef} className="island" />
}
