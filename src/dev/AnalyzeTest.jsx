// 분석 파이프라인 확인용 페이지 (?view=analyze). 녹음 → 특징 → 분류 → 이름 → 3D 꽃
import React, { useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Float } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { startRecording } from '../lib/recorder.js'
import { decode, extractFeatures, buildFlower } from '../lib/analyze.js'
import { classify } from '../lib/classify.js'
import Flower3D from '../components/Flower3D.jsx'

function PlaceholderIsland({ flower }) {
  return (
    <Float speed={1.5} floatIntensity={0.6}>
      <mesh position={[0, -0.2, 0]}>
        <cylinderGeometry args={[1.6, 1.6, 0.25, 48]} />
        <meshStandardMaterial color="#c98b5a" metalness={0.4} roughness={0.5} />
      </mesh>
      {flower && <Flower3D flower={flower} bloomKey={flower.id} position={[0, -0.07, 0]} showLabel />}
    </Float>
  )
}

// 마이크 없이 분석 파이프라인을 확인하기 위한 합성 소리(톡톡 튀는 클릭 3번)
function syntheticBuffer() {
  const sr = 44100
  const ctx = new OfflineAudioContext(1, sr * 3, sr)
  const buf = ctx.createBuffer(1, sr * 3, sr)
  const d = buf.getChannelData(0)
  for (const t of [0.3, 1.2, 2.1]) {
    const s = Math.floor(t * sr)
    for (let i = 0; i < 4000; i++) d[s + i] = Math.sin(i * 0.5) * Math.exp(-i / 600) * 0.3
  }
  return buf
}

export default function AnalyzeTest() {
  const [status, setStatus] = useState('대기 중')
  const [flower, setFlower] = useState(null)
  const [rec, setRec] = useState(null)

  async function analyzeBuffer(audio, transcript, audioUrl) {
    setStatus('분석 중…')
    const features = extractFeatures(audio)
    const result = await classify(audio)
    const f = buildFlower({
      id: crypto.randomUUID(), sender: 'A', category: result.category,
      features, transcript, audioUrl,
    })
    setFlower({ ...f, _classify: result })
    setStatus(result.confident ? '완료' : '완료 (분류 확신 낮음 → 직접 선택 필요)')
  }

  async function onRecord() {
    if (rec) { rec.stop(); return }
    try {
      const r = await startRecording({ onTick: (t) => setStatus(`녹음 중 ${t.toFixed(1)}s`) })
      setRec(r)
      const { blob, transcript } = await r.done
      setRec(null)
      await analyzeBuffer(await decode(blob), transcript, URL.createObjectURL(blob))
    } catch (e) {
      setRec(null)
      setStatus('오류: ' + e.message)
    }
  }

  return (
    <div className="app">
      <Canvas dpr={[1, 1.5]} camera={{ position: [2.6, 2.6, 3.4], fov: 45 }} gl={{ alpha: true }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[3, 5, 2]} intensity={1.2} />
        <PlaceholderIsland flower={flower} />
        <OrbitControls enablePan={false} target={[0, -0.7, 0]} />
        <EffectComposer>
          <Bloom mipmapBlur luminanceThreshold={1} intensity={0.55} radius={0.55} />
        </EffectComposer>
      </Canvas>
      <div className="panel">
        <div className="status">{status}</div>
        <div className="buttons">
          <button onClick={onRecord}>{rec ? '그만' : '녹음'}</button>
          <button onClick={() => analyzeBuffer(syntheticBuffer(), '', null)}>테스트 소리</button>
          <a className="pill" href="?">← 꽃 플레이그라운드</a>
        </div>
        {flower && (
          <div className="card">
            <strong>{flower.name}</strong>
            <p>{flower.reason}</p>
            {flower.transcript && <p>꽃말: {flower.transcript}</p>}
            <pre>{JSON.stringify({ category: flower.category, petals: flower.petals, layers: flower.layers, pointy: flower.pointy, features: flower.features }, null, 1)}</pre>
          </div>
        )}
      </div>
    </div>
  )
}
