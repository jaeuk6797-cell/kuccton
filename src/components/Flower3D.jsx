// 꽃 데이터 → 절차 생성 3D 꽃 (PRD 4.4 외형 매핑)
// 꽃잎 수 = onset, 겹 수 = 모음(양성 2겹 / 음성 3겹), 뾰족한 꽃잎 = 된소리·거센소리,
// 크기 = 음량, 중심 발광 = glow, 색 = 카테고리.
// 우리 계약(analyze.js: pointy, #hex)과 jaeuk 브랜치(flower.js: pointed, hsl(...)) 둘 다 받는다.
import React, { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { featuresToPhonology } from '../lib/onomatopoeia.js'

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const easeOutCubic = (x) => 1 - (1 - x) ** 3
const easeOutBack = (x) => {
  const c1 = 1.3, c3 = c1 + 1
  return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2
}

const CLOSED_TILT = 0.12   // 봉오리일 때 꽃잎 기울기(라디안, 0 = 똑바로 위)
const BLOOM_SECONDS = 1.8

// 'hsl(210 60% 42%)', 'hsl(210, 60%, 42%)', '#8EC5FF', 'pink' 모두 처리
export function toColor(input) {
  const c = new THREE.Color()
  if (typeof input === 'string' && input.trim().startsWith('hsl')) {
    const [h = 0, s = 50, l = 70] = (input.match(/-?\d*\.?\d+/g) || []).map(Number)
    return c.setHSL(h / 360, s / 100, l / 100)
  }
  try { c.set(input || '#F3C4E6') } catch { c.set('#F3C4E6') }
  return c
}

// 받을 수 있는 입력 3가지:
//  1) analyze.js buildFlower()   { petals, layers, size, pointy, color, glow, features:{...} }
//  2) jaeuk flower.js            { petals, size, pointed, color:'hsl(...)' }
//  3) PRD 6장 Supabase flowers 행 { petals, color, rms, centroid, attack, onsets, sent_date, ... }
// 빠진 값은 음향 특징에서 PRD 4장 규칙으로 다시 계산한다.
export function normalizeFlower(f = {}) {
  const feat = {
    rms: f.features?.rms ?? f.rms,
    centroid: f.features?.centroid ?? f.centroid,
    attack: f.features?.attack ?? f.attack,
    onsets: f.features?.onsets ?? f.onsets,
  }
  const hasFeat = feat.rms != null && feat.centroid != null && feat.attack != null
  const ph = hasFeat ? featuresToPhonology({ ...feat, onsets: feat.onsets ?? 1 }) : null

  // 모음: 양성(bright) = 작고 파스텔, 음성(dark) = 크고 진한 톤 (PRD 4.4)
  const vowel = f.vowel
    ?? ph?.vowel
    ?? (f.layers != null ? (f.layers >= 3 ? 'dark' : 'bright') : (f.size ?? 0.7) > 0.7 ? 'dark' : 'bright')
  const size = clamp(f.size ?? (vowel === 'dark' ? 0.85 : 0.55), 0.3, 1.2)
  return {
    name: f.name ?? '',
    vowel,
    petals: Math.round(clamp(f.petals ?? 2 + (feat.onsets ?? 3), 3, 8)),
    layers: Math.round(clamp(f.layers ?? (vowel === 'dark' ? 3 : 2), 1, 3)),
    size,
    pointy: Boolean(f.pointy ?? f.pointed ?? (ph ? ph.consonant !== 'plain' : false)),
    color: f.color ?? '#F3C4E6',
    glow: clamp(f.glow ?? 1 + (feat.rms ?? 0.04) * 25, 0.5, 4),
  }
}

// 카테고리 기본색에 모음 톤을 입힌다: 양성 = 파스텔, 음성 = 진하게
function toneColor(color, vowel) {
  const c = toColor(color)
  if (vowel === 'dark') return c.offsetHSL(0, 0.12, -0.14)
  return c.lerp(new THREE.Color('#ffffff'), 0.2)
}

// 꽃잎 하나: 밑동이 원점, +Y 방향으로 뻗는 격자 메쉬.
// 옆 가장자리는 꽃 안쪽(-Z)으로 오목하게, 끝은 살짝 말려 올라간다.
function makePetalGeometry({ pointy, length, width, cup = 0.5, curl = 0.25, baseColor, tipColor }) {
  const U = 18, V = 8
  const pos = [], col = [], idx = []
  const tmp = new THREE.Color()
  for (let i = 0; i <= U; i++) {
    const u = i / U
    // 폭 프로필: 둥근 꽃잎은 끝이 둥글게, 뾰족한 꽃잎은 끝으로 갈수록 직선으로 좁아짐
    const hw = pointy
      ? width * Math.sin(Math.PI * u ** 0.6)
      : width * Math.sin(Math.PI * u ** 0.85) ** 0.6
    tmp.copy(baseColor).lerp(tipColor, u ** 0.7)
    for (let j = 0; j <= V; j++) {
      const v = (j / V) * 2 - 1
      const x = v * hw
      const z = -cup * v * v * hw - curl * u * u * length
      pos.push(x, u * length, z)
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

function Stem({ height }) {
  const geo = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.03, height * 0.3, 0.02),
      new THREE.Vector3(-0.02, height * 0.7, 0),
      new THREE.Vector3(0, height, 0),
    ])
    return new THREE.TubeGeometry(curve, 20, 0.016, 6, false)
  }, [height])
  const leaf = useMemo(() => makePetalGeometry({
    pointy: true, length: 0.22, width: 0.07, cup: 0.4, curl: -0.2,
    baseColor: new THREE.Color('#4f9a63'), tipColor: new THREE.Color('#8fd19a'),
  }), [])
  useEffect(() => () => { geo.dispose(); leaf.dispose() }, [geo, leaf])
  return (
    <group>
      <mesh geometry={geo}>
        <meshStandardMaterial color="#5f9f6e" roughness={0.7} />
      </mesh>
      <mesh geometry={leaf} position={[0.01, height * 0.3, 0]} rotation={[1.0, 0.6, 0]}>
        <meshStandardMaterial vertexColors side={THREE.DoubleSide} roughness={0.6} />
      </mesh>
    </group>
  )
}

export default function Flower3D({
  flower,
  position = [0, 0, 0],
  bloomKey = 0,        // 바뀌면 다시 피어난다
  showStem = true,
  showLabel = false,
  selected = false,
  onClick,
  seed = 0,
}) {
  const f = useMemo(() => normalizeFlower(flower), [flower])
  const stemHeight = 0.45 + f.size * 0.25

  const { layers, petalMaterial, centerColor } = useMemo(() => {
    const base = toneColor(f.color, f.vowel)
    const layers = Array.from({ length: f.layers }, (_, i) => {
      const length = 0.42 * f.size * (1 - i * 0.2)
      const width = length * (f.pointy ? 0.3 : 0.4)
      const tip = base.clone().offsetHSL(0, 0.05, -0.03 * i)
      const pale = base.clone().lerp(new THREE.Color('#ffffff'), 0.6 - i * 0.1)
      return {
        geo: makePetalGeometry({ pointy: f.pointy, length, width, baseColor: pale, tipColor: tip }),
        openTilt: 1.4 - i * 0.42,               // 바깥 겹일수록 활짝
        offset: (i * Math.PI) / f.petals,        // 겹마다 엇갈리게
        delay: i * 0.15,
        y: i * 0.012,
      }
    })
    const petalMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true, side: THREE.DoubleSide, roughness: 0.45,
      emissive: base, emissiveIntensity: 0.12,
    })
    const centerColor = base.clone().lerp(new THREE.Color('#fff4c2'), 0.75)
    return { layers, petalMaterial, centerColor }
  }, [f])

  useEffect(() => () => {
    layers.forEach((l) => l.geo.dispose())
    petalMaterial.dispose()
  }, [layers, petalMaterial])

  const head = useRef()
  const petalRefs = useRef([])
  const progress = useRef(0)
  useEffect(() => { progress.current = 0 }, [bloomKey, f])

  useFrame(({ clock }, dt) => {
    if (!head.current) return
    progress.current = Math.min(1, progress.current + dt / BLOOM_SECONDS)
    const p = progress.current
    head.current.scale.setScalar(0.3 + 0.7 * easeOutCubic(Math.min(1, p * 1.5)))
    head.current.rotation.z = Math.sin(clock.elapsedTime * 0.9 + seed) * 0.04
    head.current.rotation.x = Math.sin(clock.elapsedTime * 0.7 + seed * 2) * 0.03
    layers.forEach((l, i) => {
      const lp = easeOutBack(clamp((p - l.delay) / (1 - l.delay), 0, 1))
      const tilt = CLOSED_TILT + (l.openTilt - CLOSED_TILT) * lp
      const row = petalRefs.current[i]
      if (row) for (const m of row) if (m) m.rotation.x = tilt
    })
  })

  const centerR = 0.05 + 0.04 * f.size
  const stamens = Math.max(5, f.petals)

  return (
    <group
      position={position}
      onClick={onClick && ((e) => { e.stopPropagation(); onClick(e) })}
      onPointerOver={onClick && ((e) => { e.stopPropagation(); document.body.style.cursor = 'pointer' })}
      onPointerOut={onClick && (() => { document.body.style.cursor = '' })}
    >
      {showStem && <Stem height={stemHeight} />}
      <group ref={head} position={[0, showStem ? stemHeight : 0, 0]}>
        {layers.map((l, i) => (
          <group key={i} position={[0, l.y, 0]}>
            {Array.from({ length: f.petals }, (_, j) => (
              <group key={j} rotation={[0, (j / f.petals) * Math.PI * 2 + l.offset, 0]}>
                <mesh
                  ref={(m) => { (petalRefs.current[i] ||= [])[j] = m }}
                  geometry={l.geo}
                  material={petalMaterial}
                  rotation={[CLOSED_TILT, 0, 0]}
                />
              </group>
            ))}
          </group>
        ))}
        {/* 발광하는 중심 + 꽃술 (Bloom 후처리와 함께 빛남) */}
        <mesh position={[0, centerR * 0.4, 0]}>
          <sphereGeometry args={[centerR, 20, 20]} />
          <meshStandardMaterial color={centerColor} emissive={centerColor} emissiveIntensity={f.glow} toneMapped={false} />
        </mesh>
        {Array.from({ length: stamens }, (_, k) => {
          const a = (k / stamens) * Math.PI * 2
          const r = centerR * 1.25
          return (
            <mesh key={k} position={[Math.cos(a) * r, centerR * 0.9, Math.sin(a) * r]}>
              <sphereGeometry args={[centerR * 0.22, 8, 8]} />
              <meshStandardMaterial color="#fff1a8" emissive="#ffd86b" emissiveIntensity={f.glow * 0.8} toneMapped={false} />
            </mesh>
          )
        })}
      </group>
      {(showLabel || selected) && f.name && (
        <Html center position={[0, (showStem ? stemHeight : 0) + 0.42 * f.size + 0.15, 0]} zIndexRange={[10, 0]}>
          <div className={`flower-label${selected ? ' selected' : ''}`}>{f.name}</div>
        </Html>
      )}
    </group>
  )
}
