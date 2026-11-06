// Flower3D 확인용 플레이그라운드: 예시 꽃 5송이 + 선택한 꽃 파라미터 조절
import React, { useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Sparkles } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import Flower3D, { normalizeFlower, toColor } from '../components/Flower3D.jsx'

const PRESETS = [
  { name: '토도독꽃', category: 'rain', petals: 5, layers: 2, size: 0.55, pointy: false, color: '#8EC5FF', glow: 2 },
  { name: '소곤소곤꽃', category: 'whisper', petals: 4, layers: 2, size: 0.55, pointy: false, color: '#F3C4E6', glow: 1.4 },
  { name: '깔깔꽃', category: 'laughter', petals: 6, layers: 2, size: 0.6, pointy: true, color: '#FFE36B', glow: 2.6 },
  { name: '왁자지껄꽃', category: 'speech', petals: 8, layers: 3, size: 0.85, pointy: true, color: '#FF9EC7', glow: 3.2 },
  // jaeuk 브랜치(flower.js) 형식: pointed, hsl 색, layers 없음
  { name: '투둑꽃', petals: 6, size: 0.8, pointed: false, color: 'hsl(210 60% 42%)' },
  // PRD 6장 Supabase flowers 행 형식: 모양은 rms·centroid·attack·onsets에서 다시 계산
  { name: '멍멍꽃', category: 'dog', root: '멍멍', color: '#F5A65B', petals: 4, rms: 0.12, centroid: 1500, attack: 0.7, onsets: 2, sent_date: '2026-11-06' },
]

export default function FlowerPlayground() {
  const [flowers, setFlowers] = useState(PRESETS)
  const [sel, setSel] = useState(0)
  const [bloomKey, setBloomKey] = useState(0)
  const cur = normalizeFlower(flowers[sel])

  const update = (patch) =>
    setFlowers((list) => list.map((f, i) => (i === sel ? { ...normalizeFlower(f), name: f.name, ...patch } : f)))

  return (
    <div className="app">
      <Canvas dpr={[1, 1.5]} camera={{ position: [0, 2.6, 4.8], fov: 40 }} gl={{ alpha: true }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[2, 4, 3]} intensity={1.3} />
        <mesh position={[0, -0.06, 0]} receiveShadow>
          <cylinderGeometry args={[2.9, 2.9, 0.12, 64]} />
          <meshStandardMaterial color="#a9d9a0" roughness={0.9} />
        </mesh>
        {flowers.map((f, i) => (
          <Flower3D
            key={i}
            flower={f}
            seed={i}
            position={[(i - (flowers.length - 1) / 2) * 0.95, 0, i % 2 ? -0.4 : 0.3]}
            bloomKey={bloomKey}
            showLabel
            selected={i === sel}
            onClick={() => setSel(i)}
          />
        ))}
        <Sparkles count={40} scale={[6, 2, 3]} position={[0, 1, 0]} size={1.6} speed={0.3} opacity={0.6} color="#fff3b0" />
        <OrbitControls enablePan={false} target={[0, 0.6, 0]} minDistance={1.5} maxDistance={7} />
        <EffectComposer>
          <Bloom mipmapBlur luminanceThreshold={1} intensity={0.55} radius={0.55} />
        </EffectComposer>
      </Canvas>

      <div className="panel controls">
        <div className="row title">
          <strong>{flowers[sel].name}</strong>
          <button onClick={() => setBloomKey((k) => k + 1)}>다시 피우기</button>
        </div>
        <label>꽃잎 {cur.petals}
          <input type="range" min={3} max={8} step={1} value={cur.petals} onChange={(e) => update({ petals: +e.target.value })} />
        </label>
        <label>겹 {cur.layers}
          <input type="range" min={1} max={3} step={1} value={cur.layers} onChange={(e) => update({ layers: +e.target.value })} />
        </label>
        <label>크기 {cur.size.toFixed(2)}
          <input type="range" min={0.3} max={1.2} step={0.05} value={cur.size} onChange={(e) => update({ size: +e.target.value })} />
        </label>
        <label>발광 {cur.glow.toFixed(1)}
          <input type="range" min={0.5} max={4} step={0.1} value={cur.glow} onChange={(e) => update({ glow: +e.target.value })} />
        </label>
        <div className="row">
          <label className="inline">
            <input type="checkbox" checked={cur.pointy} onChange={(e) => update({ pointy: e.target.checked })} /> 뾰족한 꽃잎
          </label>
          <input type="color" value={'#' + toColor(cur.color).getHexString()} onChange={(e) => update({ color: e.target.value })} />
          <a href="?view=analyze">분석 테스트 →</a>
        </div>
      </div>
    </div>
  )
}
