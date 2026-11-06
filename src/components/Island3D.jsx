// 떠 있는 정원 섬 (three.js). 상대 꽃은 왼쪽, 내 꽃은 오른쪽, 우리의 꽃은 가운데에 핀다.
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

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

function haloTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grd.addColorStop(0, 'rgba(255,245,200,0.9)')
  grd.addColorStop(1, 'rgba(255,245,200,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
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

  // 나무: 바깥 고리에, 앞쪽(카메라 쪽)은 비워 꽃이 보이게
  const darks = ['#2e5a3a', '#3a6b44', '#2a4f36'].map((c) => mat(c))
  const lights = ['#9cc25a', '#b6d06b', '#7fae4e', '#c9d97a'].map((c) => mat(c))
  const trunk = mat('#6b4a35'), birch = mat('#ece6da')
  for (let i = 0; i < 46; i++) {
    const a = rand() * Math.PI * 2
    const r = 2.1 + rand() * 1.6
    const x = Math.cos(a) * r, z = Math.sin(a) * r
    if (z > 1.2 && Math.abs(x) < 2.6 && rand() < 0.85) continue
    const tree = new THREE.Group()
    const s = 0.7 + rand() * 0.8
    if (rand() < 0.55) {
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.4, 5), trunk)
      tr.position.y = 0.2
      tree.add(tr)
      for (let k = 0; k < 3; k++) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.55 - k * 0.13, 0.9, 7), darks[(i + k) % 3])
        c.position.y = 0.6 + k * 0.45
        c.castShadow = true
        tree.add(c)
      }
      tree.scale.setScalar(s * 1.15)
    } else {
      const isBirch = rand() < 0.3
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.9, 5), isBirch ? birch : trunk)
      tr.position.y = 0.45
      tree.add(tr)
      const blobs = 2 + Math.floor(rand() * 2)
      for (let k = 0; k < blobs; k++) {
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35 + rand() * 0.15, 0), lights[Math.floor(rand() * lights.length)])
        b.position.set((rand() - 0.5) * 0.35, 1 + k * 0.22 + rand() * 0.1, (rand() - 0.5) * 0.35)
        b.castShadow = true
        tree.add(b)
      }
      tree.scale.setScalar(s)
    }
    tree.position.set(x, 0.17, z)
    tree.rotation.y = rand() * Math.PI
    root.add(tree)
  }
  return root
}

function buildFlower(f, colors, size = 1) {
  const g = new THREE.Group()
  const yang = f.vowel !== 'E'
  const pointed = f.consonant === '경' || f.consonant === '격'
  const loud = Math.min(1, Math.max(0, (f.rms || 0.04) / 0.12))
  const h = 0.45 + loud * 0.2
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, h, 5), mat('#5f8f45'))
  stem.position.y = h / 2
  g.add(stem)
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), mat('#79a957'))
  leaf.scale.set(1.4, 0.3, 0.6)
  leaf.position.set(0.07, h * 0.4, 0)
  g.add(leaf)

  const head = new THREE.Group()
  head.position.y = h
  const n = f.petals || 5
  const pr = (yang ? 0.12 : 0.155) * (0.9 + loud * 0.25)
  const petalMats = colors.map((c) => { const col = cssColor(c); return mat(col, { roughness: 0.6, emissive: col.clone().multiplyScalar(0.35) }) })
  for (let i = 0; i < n; i++) {
    const geo = pointed ? new THREE.ConeGeometry(pr * 0.55, pr * 2.2, 5) : new THREE.SphereGeometry(pr, 8, 6)
    const p = new THREE.Mesh(geo, petalMats[i % petalMats.length])
    const a = (i / n) * Math.PI * 2
    if (pointed) {
      p.rotation.z = -Math.PI / 2
      p.position.x = pr * 1.1
      const pivot = new THREE.Group()
      pivot.rotation.y = a
      pivot.rotation.z = 0.75
      pivot.add(p)
      head.add(pivot)
    } else {
      p.scale.set(1.3, 0.32, yang ? 0.75 : 0.95)
      p.position.x = pr * 1.0
      const pivot = new THREE.Group()
      pivot.rotation.y = a
      pivot.rotation.z = 0.7 // 꽃잎을 위로 세워 컵 모양으로
      pivot.add(p)
      head.add(pivot)
    }
  }
  const center = new THREE.Mesh(new THREE.SphereGeometry(pr * 0.55, 8, 6), mat(yang ? '#fff1c2' : '#6a4c37'))
  center.scale.y = 0.6
  head.add(center)
  g.add(head)
  g.userData.headY = h
  g.scale.setScalar(size)
  g.traverse((o) => { if (o.isMesh) o.castShadow = true })
  return g
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

export default function Island3D({ flowers, pairs, meId, freshIds, highlightId, onPickFlower, onPickPair }) {
  const wrapRef = useRef(null)
  const stateRef = useRef(null)
  const cbRef = useRef({})
  cbRef.current = { onPickFlower, onPickPair }

  // 장면은 한 번만 만든다
  useEffect(() => {
    const wrap = wrapRef.current
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    wrap.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100)
    camera.position.set(0, 6.4, 16.5)

    scene.add(new THREE.HemisphereLight('#e6eef7', '#6b5a48', 1.4))
    const sun = new THREE.DirectionalLight('#ffe0bd', 2.2)
    sun.position.set(5, 9, 5)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6 })
    scene.add(sun)

    const floating = new THREE.Group()
    floating.add(buildIsland())
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
    const sparkles = new THREE.Points(pGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 0.05, transparent: true, opacity: 0.8 }))
    scene.add(sparkles)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, -0.7, 0)
    controls.enableDamping = true
    controls.enablePan = false
    controls.minDistance = 9
    controls.maxDistance = 21
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

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = wrap
      renderer.setSize(w, h)
      camera.aspect = w / h
      // 화면이 좁을수록 조금 더 멀리
      camera.fov = w / h < 0.75 ? 40 : 34
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
      const p = pGeo.attributes.position
      for (let i = 0; i < N; i++) {
        let y = p.getY(i) + 0.004
        if (y > 6) y = -1
        p.setY(i, y)
      }
      p.needsUpdate = true
      for (const f of flowerLayer.children) {
        const u = f.userData
        const age = t - (u.bornAt ?? -10)
        const grow = Math.min(1, Math.max(0, age / 1.2))
        const e = grow < 1 ? 1 - Math.pow(1 - grow, 3) * Math.cos(grow * 6) : 1
        f.scale.setScalar(u.size * Math.max(0.001, e))
        f.rotation.z = Math.sin(t * 1.3 + u.phase) * 0.05
        if (u.halo) {
          const pulse = u.highlight || u.fresh ? 1 + Math.sin(t * 4) * 0.25 : 1
          u.halo.material.opacity = (u.highlight || u.fresh ? 0.95 : u.kind === 'pair' ? 0.6 : 0) * Math.min(1, grow * 2)
          u.halo.scale.setScalar((u.kind === 'pair' ? 0.9 : 0.6) * pulse)
        }
      }
      controls.update()
      renderer.render(scene, camera)
      raf = requestAnimationFrame(loop)
    }
    loop()

    stateRef.current = { flowerLayer, clock, known: new Set(), halo: haloTexture(), first: true }
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(resumeTimer)
      ro.disconnect()
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerup', onUp)
      controls.dispose()
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
    for (const c of [...flowerLayer.children]) flowerLayer.remove(c)

    const byId = Object.fromEntries(flowers.map((f) => [f.id, f]))
    const pairedIds = new Set()
    const items = []
    for (const p of pairs) {
      const a = byId[p.flower_a_id], b = byId[p.flower_b_id]
      if (!a || !b) continue
      pairedIds.add(a.id); pairedIds.add(b.id)
      items.push({ key: p.id, side: 0, kind: 'pair', data: p, a, b })
    }
    for (const f of flowers) items.push({ key: f.id, side: f.sender_id === meId ? 1 : -1, kind: 'flower', data: f })
    const pos = placeFlowers(items)
    const now = clock.getElapsedTime()

    items.forEach((it, i) => {
      const obj = it.kind === 'pair'
        ? buildFlower({ ...it.b, petals: Math.min(8, Math.max(it.a.petals, it.b.petals) + 1), rms: 0.12 }, [it.a.color, it.b.color])
        : buildFlower(it.data, [it.data.color])
      obj.position.set(pos[i].x, 0, pos[i].z)
      const isNew = !known.has(it.key)
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: st.halo, transparent: true, depthWrite: false, opacity: 0 }))
      halo.position.y = obj.userData.headY
      obj.add(halo)
      Object.assign(obj.userData, {
        kind: it.kind,
        data: it.data,
        size: it.kind === 'pair' ? 2.6 : 1.8,
        phase: (hash(it.key) % 100) / 16,
        bornAt: isNew ? (st.first ? now + i * 0.06 : now) : -10,
        halo,
        fresh: freshIds?.has(it.key),
        highlight: highlightId === it.key,
      })
      known.add(it.key)
      flowerLayer.add(obj)
    })
    st.first = false
  }, [flowers, pairs, meId, freshIds, highlightId])

  return <div ref={wrapRef} className="island" />
}
