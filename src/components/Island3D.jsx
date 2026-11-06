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
import { buildBlenderFlower, useBlenderFlowerAssets } from '../lib/blenderFlower.js'
import { applyWarmIslandMaterial, applyWarmIslandPaint, applyAuroraIslandMaterial, applyAuroraIslandPaint, applyFountainMaterial, applyBalancedGroundMaterial, applyBalancedGroundPaint } from '../lib/islandTone.js'
import { createAuroraAtmosphere } from '../lib/auroraAtmosphere.js'
import { createBalancedMotes } from '../lib/balancedMotes.js'
import { AuroraGlowPass } from '../lib/AuroraGlowPass.js'
import { createAuroraSparkleMaterial } from '../lib/auroraSparkles.js'
import { applyAuroraGroundGrain } from '../lib/auroraGround.js'
import { createPreviewGpuTiming } from '../lib/previewGpuTiming.js'
import { createIslandGrass } from '../lib/islandGrass.js'
import { buildTree3D } from '../lib/tree3d.js'
import { createGardenEnvironment } from '../lib/gardenEnvironment.js'
import { isTree } from '../lib/tree.js'
import { playbackLevel } from '../lib/audio.js'

// All themes use the same approved Blender island.
// 약속: 원점 = 섬 윗면 중앙, Y-up, Draco 압축 가능. 크기는 지름이 ISLAND_RADIUS*2가 되도록 자동 맞춤.
const MODERN_ISLAND_GLB = `${import.meta.env.BASE_URL}models/island-modern.glb`
const normalizeTone = tone => ['balanced', 'warm', 'aurora', 'default'].includes(tone) ? tone : 'balanced'
const ISLAND_RADIUS = 4
const ISLAND_TOP_Y = 0.17

// 카메라: 기본은 섬 전체 보기, 필요한 경우 최대 4배 확대 허용
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

function applyOpalReflection(material, tone) {
  if (material.name !== 'SUP Opalescent ground' || material.userData.opalReflection) return
  material.userData.opalReflection = true
  // Native thin-film shading added measured cost without a visible gain over this angular scatter.
  material.iridescence = 0
  const warm = tone !== 'default'
  const aurora = tone === 'aurora'
  const balanced = tone === 'balanced'
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
      vec3 opalTint = opalWeights.x * vec3(${aurora ? '1.14, 0.88, 1.20' : balanced ? '0.96, 1.12, 1.02' : warm ? '1.02, 1.03, 1.10' : '0.72, 1.12, 1.14'})
        + opalWeights.y * vec3(${aurora ? '1.40, 0.72, 1.10' : balanced ? '1.14, 1.03, 0.88' : warm ? '1.26, 0.78, 0.96' : '1.18, 0.78, 1.03'})
        + opalWeights.z * vec3(${aurora ? '0.78, 1.14, 1.28' : balanced ? '1.04, 0.99, 1.13' : warm ? '1.02, 0.86, 1.24' : '1.14, 0.76, 1.18'});
      // A quiet pearl body persists while reflected color strengthens toward grazing views.
      reflectedLight.indirectDiffuse *= mix(vec3(${aurora ? '0.92, 1.04, 1.11' : warm ? '1.06, 1.0, 0.97' : '0.92, 1.02, 1.04'}), opalTint,
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
      reflectedLight.indirectSpecular *= 1.0 + ${aurora ? '1.2' : '31.0'} * opalUpperView * opalUpperHighlight;
    `)
    if (aurora) applyAuroraGroundGrain(shader)
  }
  material.customProgramCacheKey = () => `sup-opal-reflection-v3-${tone}${aurora ? '-mineral-grains-v1' : ''}`
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


function buildIsland(tone) {
  const rand = rng(20261106)
  const root = new THREE.Group()

  const grass = new THREE.Mesh(jitter(new THREE.CylinderGeometry(4, 3.9, 0.35, 30, 1), 0.25, rand, (x, y) => y > 0 && Math.hypot(x) < 0), mat(tone === 'aurora' ? '#4b5a83' : tone === 'default' ? '#86b85c' : '#dfccc5'))
  grass.receiveShadow = true
  root.add(grass)

  const dirt = new THREE.Mesh(jitter(new THREE.CylinderGeometry(3.95, 3.6, 0.5, 30, 1), 0.2, rand), mat(tone === 'aurora' ? '#253849' : tone === 'default' ? '#6e4b33' : '#8f6d68'))
  dirt.position.y = -0.4
  root.add(dirt)

  const rockGeo = new THREE.ConeGeometry(3.6, 3.4, 16, 5)
  rockGeo.rotateX(Math.PI)
  const rock = new THREE.Mesh(jitter(rockGeo, 0.7, rand, (x, y) => y > 1.6), mat(tone === 'aurora' ? '#365b7f' : tone === 'default' ? '#857565' : '#9c7e82'))
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
  const tuftMat = mat(tone === 'aurora' ? '#46949e' : tone === 'default' || tone === 'balanced' ? '#9ccc6a' : '#cfb3c0')
  for (let i = 0; i < 90; i++) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * 3.8
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.18 + rand() * 0.12, 3), tuftMat)
    t.position.set(Math.cos(a) * r, 0.25, Math.sin(a) * r)
    root.add(t)
  }

  // 장식용 숲은 두지 않는다: 섬 위에는 주고받은 소리로 핀 꽃과 소리 나무만 자란다
  return root
}

function loadIslandGlb(onReady, onError) {
  let disposed = false
  const draco = new DRACOLoader()
  draco.setDecoderPath(`${import.meta.env.BASE_URL}draco/`)
  const loader = new GLTFLoader()
  loader.setDRACOLoader(draco)
  loader.load(
    MODERN_ISLAND_GLB,
    (gltf) => {
      const model = gltf.scene
      if (disposed) {
        disposeMeshes(model)
        return
      }
      const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3())
      model.scale.setScalar((ISLAND_RADIUS * 2) / Math.max(size.x, size.z, 0.001))
      model.position.y = ISLAND_TOP_Y
      let assetTriangles = 0
      model.traverse((o) => {
        if (!o.isMesh) return
        assetTriangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3
        const materials = Array.isArray(o.material) ? o.material : [o.material]
        const transparent = materials.some((material) => material.transparent)
        // Alpha crystals keep their transmitted appearance; only solid perimeter details cast shadows.
        o.castShadow = !transparent && /Island_Vegetation/.test(o.name)
        o.receiveShadow = !transparent && /^(Island_(Surface|Pond|Accents|Vegetation)|Fountain_)/.test(o.name)
      })
      draco.dispose()
      onReady(model, assetTriangles)
    },
    undefined,
    () => {
      draco.dispose()
      if (!disposed) onError()
    }, // 모델이 없거나 읽을 수 없으면 코드로 만든 섬을 그대로 둔다
  )
  return () => {
    disposed = true
    draco.dispose()
  }
}

function prepareIslandAppearance(model) {
  const meshes = [], paints = new Map(), variants = new Map()
  model.traverse(mesh => {
    if (!mesh.isMesh) return
    const plantingSurface = /^Island_Surface/.test(mesh.name)
    meshes.push({ mesh, source: mesh.material, plantingSurface })
    const colors = mesh.geometry.attributes.color
    if (!colors || paints.has(colors)) return
    // The canonical GLB uses a single material per primitive and packed colors.
    paints.set(colors, { original: colors.array.slice(), name: mesh.material.name, plantingSurface })
    colors.setUsage(THREE.DynamicDrawUsage)
  })
  let activePaint
  return {
    setTone(tone) {
      let materials = variants.get(tone)
      if (!materials) variants.set(tone, materials = new Map())
      const materialFor = (source, plantingSurface) => {
        // The pond's mineral basin shares the authored ground material.
        const balancedGround = tone === 'balanced' && plantingSurface
        const key = balancedGround ? `planting-surface:${source.uuid}` : source
        if (!materials.has(key)) {
          const material = source.clone()
          if (balancedGround) applyBalancedGroundMaterial(material)
          else {
            if (tone === 'aurora') applyAuroraIslandMaterial(material)
            else if (tone !== 'default') applyWarmIslandMaterial(material)
            applyOpalReflection(material, tone)
            applyFountainMaterial(material, tone)
          }
          materials.set(key, material)
        }
        return materials.get(key)
      }
      for (const { mesh, source, plantingSurface } of meshes) {
        mesh.material = Array.isArray(source)
          ? source.map(material => materialFor(material, plantingSurface))
          : materialFor(source, plantingSurface)
      }

      const paint = tone
      if (activePaint === paint) return
      for (const [colors, { original, name, plantingSurface }] of paints) {
        // Restart from the authored RGBA values. Upload into the same GPU attribute.
        colors.array.set(original)
        if (paint === 'aurora') applyAuroraIslandPaint(colors, name)
        if (paint === 'balanced' && plantingSurface) applyBalancedGroundPaint(colors)
        else if (paint === 'warm' || paint === 'balanced') applyWarmIslandPaint(colors, name)
        colors.needsUpdate = true
      }
      activePaint = paint
    },
    dispose() {
      // Scene cleanup owns the original materials, textures and shared geometry.
      for (const { mesh, source } of meshes) mesh.material = source
      for (const materials of variants.values()) for (const material of materials.values()) material.dispose()
    },
  }
}

// ───────── 꽃 자리 ─────────
// 섬 위에 벌집 모양 자리(슬롯)를 미리 깔고 살짝 흔들어 둔다. 장식(거울 고리·수정 결정·연못)이 있는 곳은 비운다.
// 반지름 3.4 · 간격 0.66 → 자리 약 69개: 받은 소리 50송이(정원 최대)와 우리의 꽃이 겹치지 않거나 살짝만 닿는다.
// Keep the historical slot exclusions so existing plants retain their positions.
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
function dimObject(obj, tone) {
  const materials = new Set()
  obj.traverse((o) => {
    if (!o.isMesh) return
    for (const material of Array.isArray(o.material) ? o.material : [o.material]) materials.add(material)
    o.castShadow = false
  })
  // Each plant owns its materials. All petals or facets on that plant can stay on the same material.
  for (const material of materials) {
    material.transparent = true
    material.opacity = 0.22
    material.color.lerp(tone === 'default' ? DIM_GREY : new THREE.Color('#cdbbc1'), 0.55)
  }
}

// Preview diagnostics use a fixed window; normal gardens allocate no timing samples.
function timingSamples() {
  return { values: new Float64Array(180), cursor: 0, count: 0 }
}
function recordTiming(samples, value) {
  samples.values[samples.cursor] = value
  samples.cursor = (samples.cursor + 1) % samples.values.length
  samples.count = Math.min(samples.count + 1, samples.values.length)
}
function timingSummary(samples) {
  if (!samples.count) return { samples: 0, meanMs: 0, p95Ms: 0 }
  const sorted = samples.values.slice(0, samples.count).sort()
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length
  return {
    samples: samples.count,
    meanMs: Number(mean.toFixed(2)),
    p95Ms: Number(sorted[Math.ceil(sorted.length * 0.95) - 1].toFixed(2)),
  }
}

export default function Island3D({ flowers, pairs, meId, freshIds, highlightId, visibleIds, onPickFlower, onPickPair, resetViewKey, isBlenderFlower, onPreviewStats, previewApi, onThemeStatus, retryThemeKey, tone = 'balanced', previewAngle = 'front', previewTime, active = true }) {
  const wrapRef = useRef(null)
  const stateRef = useRef(null)
  const propsRef = useRef(null)
  propsRef.current = { onPickFlower, onPickPair, onPreviewStats, onThemeStatus, previewTime, active }
  const assets = useBlenderFlowerAssets(Boolean(isBlenderFlower))

  // The renderer, clock, camera and controls survive every theme change.
  useEffect(() => {
    const wrap = wrapRef.current
    const diagnostics = Boolean(onPreviewStats || previewApi)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.NeutralToneMapping
    renderer.toneMappingExposure = 1
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    renderer.info.autoReset = !diagnostics
    wrap.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.1, 100)
    camera.position.set(...CAMERA.position)
    const hemisphere = new THREE.HemisphereLight()
    const sun = new THREE.DirectionalLight('#fff1dc', 1.5)
    sun.position.set(5, 8, 5)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 0.5, far: 25 })
    sun.shadow.radius = 3
    sun.shadow.normalBias = 0.025
    sun.shadow.bias = -0.0001
    const fill = new THREE.DirectionalLight()
    fill.position.set(-4, -1, 3)
    const rim = new THREE.DirectionalLight('#99e0eb', 0.7)
    rim.position.set(-3, 4, -6)
    scene.add(hemisphere, sun, fill, rim)

    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    composer.addPass(new OutputPass())
    let glow = null, environment = null, atmosphere = null, balancedMotes = null
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const floating = new THREE.Group()
    const islandGroup = new THREE.Group()
    islandGroup.add(buildIsland(normalizeTone(tone)))
    const flowerLayer = new THREE.Group()
    flowerLayer.position.y = ISLAND_TOP_Y
    floating.add(islandGroup, flowerLayer)
    scene.add(floating)
    let islandModel = null, islandAppearance = null, grass = null, fountainFlow = null
    const N = 140, pts = new Float32Array(N * 3), r0 = rng(7)
    for (let i = 0; i < N; i++) pts.set([(r0() - 0.5) * 12, r0() * 7 - 1, (r0() - 0.5) * 10], i * 3)
    const pGeo = new THREE.BufferGeometry()
    pGeo.setAttribute('position', new THREE.BufferAttribute(pts, 3))
    const sparkles = new THREE.Points(pGeo, new THREE.PointsMaterial())
    scene.add(sparkles)
    let level = 0

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(...CAMERA.target)
    controls.enableDamping = true
    controls.enablePan = false
    controls.maxDistance = CAMERA.max
    controls.minPolarAngle = 0.55
    controls.maxPolarAngle = 1.4
    controls.autoRotate = !diagnostics
    controls.autoRotateSpeed = 0.35
    let resumeTimer
    const resumeOrbit = () => {
      if (!diagnostics) resumeTimer = setTimeout(() => (controls.autoRotate = true), 5000)
    }
    controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(resumeTimer) })
    controls.addEventListener('end', resumeOrbit)
    const ray = new THREE.Raycaster()
    let down = null
    const el = renderer.domElement
    const pick = o => {
      if (o?.userData.dimmed) return
      if (o?.userData.kind === 'flower') propsRef.current.onPickFlower?.(o.userData.data)
      if (o?.userData.kind === 'pair') propsRef.current.onPickPair?.(o.userData.data)
    }
    const onDown = e => { down = { x: e.clientX, y: e.clientY } }
    const onUp = e => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return
      const rect = el.getBoundingClientRect()
      ray.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), camera)
      let o = ray.intersectObjects(flowerLayer.children, true)[0]?.object
      while (o && !o.userData.kind) o = o.parent
      pick(o)
      down = null
    }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerup', onUp)

    const target = new THREE.Vector3(...CAMERA.target)
    const viewDir = new THREE.Vector3(...CAMERA.position).sub(target)
    const baseDist = viewDir.length()
    viewDir.normalize()
    if (previewAngle === 'rotated') viewDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI * 0.7)
    let viewportWidth = 0, viewportHeight = 0, homeDistance = baseDist
    const resize = () => {
      const { clientWidth: w, clientHeight: h } = wrap
      if (!w || !h) return
      const first = !viewportWidth
      const dimensionsChanged = w !== viewportWidth || h !== viewportHeight
      const previousHomeDistance = homeDistance
      viewportWidth = w
      viewportHeight = h
      renderer.setSize(w, h)
      composer.setSize(w, h)
      camera.aspect = w / h
      // Keep main's full-screen framing and maximum 4x zoom in production.
      const home = wrap.closest('.home')
      const style = home ? getComputedStyle(home) : null
      const top = home ? Math.max(0, parseFloat(style?.getPropertyValue('--island-top')) || 120) : 0
      const bottom = home ? Math.max(0, parseFloat(style?.getPropertyValue('--island-bottom')) || 80) : 0
      const contentHeight = Math.max(80, h - top - bottom)
      const halfVertical = THREE.MathUtils.degToRad(CAMERA.fov) / 2
      const contentHalfVertical = Math.atan(Math.tan(halfVertical) * contentHeight / h)
      const halfHorizontal = Math.atan(Math.tan(halfVertical) * camera.aspect)
      homeDistance = Math.max(baseDist, FIT_RADIUS / Math.sin(Math.min(contentHalfVertical, halfHorizontal)))
      camera.setViewOffset(w, h, 0, (bottom - top) / 2, w, h)
      controls.minDistance = homeDistance * 0.25
      controls.maxDistance = Math.max(CAMERA.max, homeDistance + (diagnostics ? 15 : 3))
      camera.updateProjectionMatrix()
      if (first) {
        controls.target.copy(target)
        camera.position.copy(target).addScaledVector(viewDir, homeDistance)
        controls.update()
        controls.saveState()
      } else if (dimensionsChanged) {
        // Preserve the user's orbit and relative zoom when the phone rotates.
        camera.position.sub(controls.target).multiplyScalar(homeDistance / previousHomeDistance).add(controls.target)
        controls.update()
      }
    }
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)
    wrap.closest('.home')?.querySelectorAll('.home-title, .home-sheet').forEach(node => ro.observe(node))
    resize()
    const clock = new THREE.Clock()
    const timings = diagnostics ? { frame: timingSamples(), renderCPU: timingSamples(), lastFrame: null } : null
    let gpuTiming = diagnostics ? createPreviewGpuTiming(renderer) : null
    let frozenTime, cancelLoad = null
    const st = {
      flowerLayer, islandGroup, clock, camera, controls, viewDir, known: new Set(), first: true,
      tone: normalizeTone(tone), requestedTone: null, themeStatus: null, themeSwitches: 0,
      resetView: () => {
        clearTimeout(resumeTimer)
        controls.autoRotate = false
        controls.target.copy(target)
        camera.position.copy(target).addScaledVector(viewDir, homeDistance)
        controls.update()
        resumeOrbit()
      },
    }
    function applyLighting(nextTone) {
      const aurora = nextTone === 'aurora', warm = nextTone !== 'default', balanced = nextTone === 'balanced'
      const nextEnvironment = createGardenEnvironment(renderer, 256, nextTone)
      scene.environment = nextEnvironment.texture
      scene.environmentIntensity = aurora ? 0.52 : 0.55
      environment?.dispose()
      environment = nextEnvironment
      hemisphere.color.set(aurora ? '#ead9ef' : balanced ? '#f5edda' : warm ? '#f6dfd8' : '#ccd9f3')
      hemisphere.groundColor.set(aurora ? '#789bac' : balanced ? '#89917b' : warm ? '#94747f' : '#6c7d88')
      hemisphere.intensity = aurora ? 0.72 : warm ? 0.46 : 0.38
      sun.color.set(aurora ? '#ffe5d6' : warm ? '#fff1dc' : '#fff1e8')
      sun.shadow.intensity = aurora ? 0.48 : 0.55
      fill.color.set(aurora ? '#f19bc5' : balanced ? '#d8e2c6' : warm ? '#dcb8d3' : '#a8dce4')
      fill.intensity = aurora ? 0.6 : warm ? 0.52 : 0.65
      rim.visible = aurora
      if (atmosphere) { scene.remove(atmosphere); disposeMeshes(atmosphere); atmosphere = null }
      if (aurora) { atmosphere = createAuroraAtmosphere(); scene.add(atmosphere) }
      if (balanced && !balancedMotes) {
        balancedMotes = createBalancedMotes(rng(91), renderer.getPixelRatio())
        scene.add(balancedMotes)
      }
      if (balancedMotes) balancedMotes.visible = balanced
      sparkles.visible = !balanced
      sparkles.material.dispose()
      sparkles.material = aurora ? createAuroraSparkleMaterial(SPARKLE.size)
        : new THREE.PointsMaterial({ color: '#ffffff', size: SPARKLE.size, transparent: true, opacity: 0.8 })
      if (glow) { composer.removePass(glow); glow.dispose(); glow = null }
      if (aurora) {
        glow = new AuroraGlowPass({ strength: 0.24, threshold: 1.05 })
        composer.insertPass(glow, 1)
      }
      st.tone = nextTone
      wrap.dataset.tone = nextTone
    }
    applyLighting(st.tone)
    function themeStatus(status) {
      st.themeStatus = status
      wrap.dataset.ready = status
      propsRef.current.onThemeStatus?.({ tone: st.requestedTone, status })
    }
    function commitTheme() {
      const nextTone = st.requestedTone
      islandAppearance.setTone(nextTone)
      grass?.setTheme(nextTone)
      if (st.tone !== nextTone) {
        applyLighting(nextTone)
        st.rebuildPlants?.(nextTone)
      }
      if (timings) {
        timings.frame = timingSamples()
        timings.renderCPU = timingSamples()
        timings.lastFrame = null
      }
      st.themeSwitches++
      themeStatus('loaded')
    }
    st.requestTone = nextTone => {
      nextTone = normalizeTone(nextTone)
      if (st.requestedTone === nextTone && st.themeStatus !== 'error') return
      st.requestedTone = nextTone
      wrap.dataset.requestedTone = nextTone
      if (islandModel) { commitTheme(); return }
      islandGroup.userData.assetStatus = 'loading'
      themeStatus('loading')
      if (cancelLoad) return
      // A pending load serves every theme request. Apply the latest tone when it arrives.
      cancelLoad = loadIslandGlb((model, assetTriangles) => {
        cancelLoad = null
        islandModel = model
        fountainFlow = model.getObjectByName('Fountain_Water_Flow')
        islandAppearance = prepareIslandAppearance(model)
        grass = createIslandGrass(model, { tone: st.requestedTone })
        disposeMeshes(islandGroup)
        islandGroup.clear()
        islandGroup.add(model)
        Object.assign(islandGroup.userData, { grass, assetTriangles, assetStatus: 'loaded' })
        commitTheme()
        grass?.updatePlants(flowerLayer.children.map(plant => plant.position), flowerLayer)
      }, () => {
        cancelLoad = null
        islandGroup.userData.assetStatus = 'fallback'
        themeStatus('error')
      })
    }
    function snapshot() {
      const plants = flowerLayer.children
      scene.updateMatrixWorld(true)
      camera.updateMatrixWorld(true)
      const project = plant => {
        const center = new THREE.Vector3(0, plant.userData.headY ?? 0.5, 0)
        plant.localToWorld(center).project(camera)
        return { x: (center.x + 1) * viewportWidth / 2, y: (1 - center.y) * viewportHeight / 2 }
      }
      return {
        tone: st.tone, requestedTone: st.requestedTone, themeStatus: st.themeStatus, themeSwitches: st.themeSwitches,
        plants: plants.length, near: plants.filter(f => f.userData.lod === 'near').length, far: plants.filter(f => f.userData.lod === 'far').length,
        calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
        balancedMotes: balancedMotes?.visible ? { count: balancedMotes.geometry.attributes.position.count, time: balancedMotes.material.uniforms.uTime.value, buffer: balancedMotes.geometry.uuid } : null,
        geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, programs: renderer.info.programs?.length ?? 0,
        island: islandGroup.userData.assetStatus, islandChildren: islandGroup.children.length,
        islandGeometry: {
          modelUUID: islandModel?.uuid ?? null,
          assetTriangles: islandGroup.userData.assetTriangles ?? 0,
          grassTriangles: islandGroup.userData.grass?.mesh.userData.triangles ?? 0,
          grassClumps: islandGroup.userData.grass?.mesh.count ?? 0,
          grassDrawCalls: islandGroup.userData.grass ? 1 : 0,
          grassTheme: islandGroup.userData.grass?.theme ?? null,
          grassMeshUUID: islandGroup.userData.grass?.mesh.uuid ?? null,
          grassGeometryUUID: islandGroup.userData.grass?.mesh.geometry.uuid ?? null,
          grassInstanceBufferId: grass?.mesh.instanceMatrix.id ?? null,
          grassMatrixVersion: grass?.mesh.instanceMatrix.version ?? null,
        },
        growing: plants.filter(f => !f.userData.opened).length, opened: plants.filter(f => f.userData.opened).length,
        camera: { position: camera.position.toArray(), target: controls.target.toArray() },
        viewport: { width: viewportWidth, height: viewportHeight, pixelRatio: renderer.getPixelRatio() },
        plantStates: plants.map(f => ({ id: f.userData.data.id, kind: f.userData.kind, tree: isTree(f.userData.data), blender: Boolean(f.userData.blender), lod: f.userData.lod ?? null, position: f.position.toArray(), scale: f.scale.toArray(), bornAt: f.userData.bornAt, opened: Boolean(f.userData.opened), highlighted: Boolean(f.userData.highlight), screen: project(f) })),
        performance: diagnostics ? { frame: timingSummary(timings.frame), renderCPU: timingSummary(timings.renderCPU), gpu: gpuTiming.sample() } : null,
      }
    }
    const api = {
      snapshot,
      decoration: () => {
        const fountain = []
        let ground, pond
        islandModel?.traverse(mesh => {
          if (!mesh.isMesh) return
          const color = mesh.material.color.getHexString()
          if (mesh.name.startsWith('Island_Surface')) ground = { color, roughness: mesh.material.roughness }
          if (mesh.name.startsWith('Island_Pond') && mesh.material.name === 'SUP Still aqua water') pond = color
          if (mesh.name.startsWith('Fountain_')) fountain.push({ name: mesh.name, geometry: mesh.geometry.uuid, color })
        })
        const basin = islandModel?.getObjectByName('Fountain_Basin')
        const bounds = basin ? new THREE.Box3().setFromObject(basin) : null
        return { ground, pond, fountain, basin: bounds && { min: bounds.min.toArray(), max: bounds.max.toArray() }, flowAngle: fountainFlow?.rotation.y }
      },
      islandPaint: () => {
        const colors = []
        islandModel?.traverse(mesh => {
          if (mesh === grass?.mesh) return
          const array = mesh.geometry?.attributes.color?.array
          if (!array) return
          const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength)
          let checksum = 2166136261
          for (const byte of bytes) checksum = Math.imul(checksum ^ byte, 16777619)
          colors.push(checksum >>> 0)
        })
        return colors
      },
      setCamera: ({ position, target: nextTarget }) => {
        controls.autoRotate = false
        // Drain prior pointer damping so fixed-pose comparisons are deterministic.
        const damping = controls.enableDamping
        controls.enableDamping = false
        controls.update()
        if (position) camera.position.fromArray(position)
        if (nextTarget) controls.target.fromArray(nextTarget)
        controls.update()
        controls.enableDamping = damping
      },
      pick: id => pick(flowerLayer.children.find(f => f.userData.data.id === id)),
      resetView: st.resetView,
      freeze: time => { frozenTime = time; controls.autoRotate = false },
      resetPerformance: () => {
        if (!timings) return
        timings.frame = timingSamples()
        timings.renderCPU = timingSamples()
        timings.lastFrame = null
        gpuTiming?.dispose()
        gpuTiming = createPreviewGpuTiming(renderer)
      },
    }
    if (previewApi) previewApi.current = api
    stateRef.current = st
    let raf, lastStats = 0
    const loop = frameTime => {
      raf = requestAnimationFrame(loop)
      if (!propsRef.current.active) { if (timings) timings.lastFrame = null; return }
      const elapsed = clock.getElapsedTime()
      const t = frozenTime ?? propsRef.current.previewTime ?? elapsed
      const measure = diagnostics && elapsed >= 2 && islandGroup.userData.assetStatus === 'loaded'
      if (timings && frameTime != null) {
        if (measure && timings.lastFrame != null) recordTiming(timings.frame, frameTime - timings.lastFrame)
        timings.lastFrame = frameTime
      }
      floating.position.y = Math.sin(t * 0.6) * 0.08
      if (balancedMotes?.visible) balancedMotes.material.uniforms.uTime.value = reducedMotion.matches ? 6 : t
      if (sparkles.visible) {
        level += (playbackLevel() - level) * 0.15
        const sparkleMat = sparkles.material, aurora = st.tone === 'aurora'
        sparkleMat.size = SPARKLE.size * (aurora ? 1.6 : 1) * (1 + level * SPARKLE.sizeBoost)
        if (aurora) sparkleMat.userData.time.value = t
        sparkleMat.opacity = 0.8 + level * 0.2
        sparkleMat.color.copy(SPARKLE_IDLE).lerp(SPARKLE_PLAY, Math.min(1, level * 1.5))
        const rise = frozenTime == null && propsRef.current.previewTime == null ? SPARKLE.speed * (1 + level * SPARKLE.speedBoost) : 0
        const p = pGeo.attributes.position
        for (let i = 0; i < N; i++) { const y = p.getY(i) + rise; p.setY(i, y > 6 ? -1 : y) }
        p.needsUpdate = true
      }
      controls.update()
      atmosphere?.userData.tick(t, camera)
      if (fountainFlow) {
        const ripple = Math.sin(t * 1.8)
        fountainFlow.rotation.y = .12 * Math.sin(t * .85)
        fountainFlow.scale.set(1 + .025 * ripple, 1 + .009 * ripple, 1 + .025 * ripple)
      }
      for (const f of flowerLayer.children) {
        const u = f.userData
        const age = propsRef.current.previewTime == null ? t - (u.bornAt ?? -10) : propsRef.current.previewTime
        const grow = Math.min(1, Math.max(0, age / 1.2)), e = 1 - Math.pow(1 - grow, 3)
        const pulse = u.highlight || u.fresh ? 1 + Math.sin(t * 4) * 0.08 : 1
        f.scale.setScalar(u.size * Math.max(0.001, 0.3 + 0.7 * e) * pulse)
        if (!u.opened && u.setOpen) {
          const open = Math.min(1, Math.max(0, age / 1.8))
          u.setOpen(open)
          if (open >= 1) u.opened = true
        }
        u.tick?.(t)
        f.rotation.z = Math.sin(t * 1.3 + u.phase) * 0.05
        u.updateLOD?.(camera, viewportHeight, u.size)
      }
      if (diagnostics) renderer.info.reset()
      const renderStart = measure ? performance.now() : 0
      if (measure) gpuTiming.begin()
      composer.render()
      if (measure) { gpuTiming.end(); recordTiming(timings.renderCPU, performance.now() - renderStart) }
      if (propsRef.current.onPreviewStats && elapsed - lastStats >= 0.25) {
        lastStats = elapsed
        propsRef.current.onPreviewStats(snapshot())
      }
    }
    loop()
    return () => {
      cancelAnimationFrame(raf)
      cancelLoad?.()
      gpuTiming?.dispose()
      clearTimeout(resumeTimer)
      ro.disconnect()
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerup', onUp)
      controls.dispose()
      grass?.dispose()
      islandAppearance?.dispose()
      for (const plant of [...flowerLayer.children]) { flowerLayer.remove(plant); disposeFlower3D(plant) }
      disposeMeshes(scene)
      scene.environment = null
      environment?.dispose()
      sun.shadow.dispose()
      for (const pass of composer.passes) pass.dispose()
      composer.dispose()
      renderer.dispose()
      wrap.removeChild(el)
      if (previewApi?.current === api) previewApi.current = null
      stateRef.current = null
    }
  }, [])

  useEffect(() => { stateRef.current?.requestTone(tone) }, [tone, retryThemeKey])
  useEffect(() => { if (resetViewKey != null) stateRef.current?.resetView() }, [resetViewKey])
  useEffect(() => {
    const st = stateRef.current
    if (!st) return
    const angle = previewAngle === 'rotated' ? Math.PI * 0.7 : 0
    if (st.previewAngle != null && st.previewAngle !== previewAngle) {
      const previousAngle = st.previewAngle === 'rotated' ? Math.PI * 0.7 : 0
      st.viewDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle - previousAngle)
      st.camera.position.sub(st.controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle - previousAngle).add(st.controls.target)
      st.controls.update()
    }
    st.previewAngle = previewAngle
  }, [previewAngle])

  // Also used by the atomic theme commit. Preserve bornAt, opened petals and LOD.
  useEffect(() => {
    const st = stateRef.current
    if (!st) return
    st.rebuildPlants = appliedTone => {
      const { flowerLayer, clock, known } = st
      const previous = new Map(flowerLayer.children.map(plant => [plant.userData.data.id, plant]))
      const byId = Object.fromEntries(flowers.map(f => [f.id, f]))
      const items = []
      for (const p of pairs) {
        const a = byId[p.flower_a_id], b = byId[p.flower_b_id]
        if (!a || !b) continue
        const at = f => f.shared_at || f.created_at || ''
        items.push({ key: p.id, kind: 'pair', data: p, a, b, t: [at(a), at(b)].sort().pop() })
      }
      for (const f of flowers) {
        if (f.sender_id === meId) continue
        items.push({ key: f.id, kind: 'flower', data: f, t: f.shared_at || f.created_at })
      }
      const pos = placeFlowers(items)
      const density = Math.max(0.72, Math.min(1, Math.sqrt(20 / Math.max(items.length, 1))))
      const visible = visibleIds == null ? null : new Set(visibleIds ? visibleIds.split(',') : [])
      const now = clock.getElapsedTime()
      items.forEach((it, i) => {
        const dimmed = Boolean(visible && !visible.has(it.key))
        const blender = Boolean(assets && it.kind === 'flower' && !isTree(it.data) && isBlenderFlower?.(it.data))
        const old = previous.get(it.key), u = old?.userData
        const reuse = u && u.data === it.data && u.a === it.a && u.b === it.b
          && Boolean(u.blender) === blender && u.dimmed === dimmed && u.tone === appliedTone
        let obj = old
        if (!reuse) {
          if (it.kind === 'pair') obj = buildFlower3D({ ...it.b, petals: Math.min(8, Math.max(it.a.petals, it.b.petals) + 1) }, [it.a.color, it.b.color], { pair: true, tone: appliedTone })
          else if (isTree(it.data)) obj = buildTree3D(it.data, { tone: appliedTone })
          else obj = blender ? buildBlenderFlower(it.data, assets, { dimmed, tone: appliedTone }) : buildFlower3D(it.data, undefined, { tone: appliedTone })
          if (dimmed) dimObject(obj, appliedTone)
          if (u) {
            obj.scale.copy(old.scale)
            obj.rotation.copy(old.rotation)
            obj.userData.setOpen?.(u.opened ? 1 : Math.min(1, Math.max(0, (now - (u.bornAt ?? -10)) / 1.8)))
            obj.userData.opened = u.opened
            obj.userData.setLOD?.(u.lod)
          }
          flowerLayer.add(obj)
        } else previous.delete(it.key)
        obj.position.set(pos[i].x, 0, pos[i].z)
        const isNew = !known.has(it.key)
        Object.assign(obj.userData, {
          kind: it.kind, data: it.data, a: it.a, b: it.b, tone: appliedTone,
          size: (it.kind === 'pair' ? 2.6 : isTree(it.data) ? 1.85 : 1.65) * density,
          phase: (hash(it.key) % 100) / 16,
          bornAt: u?.bornAt ?? (isNew ? (st.first ? now + i * 0.06 : now) : -10),
          fresh: freshIds?.has(it.key), highlight: highlightId === it.key, dimmed,
        })
        known.add(it.key)
      })
      for (const obj of previous.values()) { flowerLayer.remove(obj); disposeFlower3D(obj) }
      wrapRef.current.dataset.plants = String(flowerLayer.children.length)
      st.first = false
    }
    st.rebuildPlants(st.tone)
    st.islandGroup.userData.grass?.updatePlants(st.flowerLayer.children.map(plant => plant.position), st.flowerLayer)
  }, [flowers, pairs, meId, freshIds, highlightId, visibleIds, assets, isBlenderFlower])

  return <div ref={wrapRef} className="island" />
}
