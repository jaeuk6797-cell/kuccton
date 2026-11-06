// 개발용: 감정 꽃 7종 한눈에 보기.  npm run dev → http://localhost:5173/?view=flowers
// 실제 앱과 같은 규칙(flower.js → naming.js toFlowerRow → flower3d.js)으로 만든다.
// 위 줄은 작고 맑은 소리, 아래 줄은 크고 낮은 소리 → 같은 감정이라도 크기·색이 달라진다.
import FlowerBloom3D from '../components/FlowerBloom3D.jsx'
import { CATEGORIES, buildFlower } from '../lib/flower.js'
import { toFlowerRow } from '../lib/naming.js'
import { EMOTION_SHAPES } from '../lib/flower3d.js'

const SOFT = { rms: 0.03, centroid: 2600, attack: 0.15, onsets: 3, sustain: 0.5, envelope: [0.6, 0.9, 0.7, 1, 0.8, 0.6] }
const LOUD = { rms: 0.13, centroid: 1300, attack: 0.3, onsets: 5, sustain: 0.5, envelope: [1, 0.5, 0.9, 0.4, 1, 0.6, 0.8] }

function row(category, features) {
  const flower = buildFlower(category, features, 1)
  return toFlowerRow({ flower, features, kind: 'voice', category, transcript: null })
}

export default function EmotionFlowers() {
  return (
    <div className="page" style={{ position: 'static', minHeight: '100dvh' }}>
      <h1 className="page-title">감정 꽃 7종</h1>
      <p className="small muted">위: 작고 맑은 목소리 · 아래: 크고 낮은 목소리</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
        {CATEGORIES.map((c) => {
          const soft = row(c.id, SOFT)
          const loud = row(c.id, LOUD)
          return (
            <div key={c.id} className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: 10 }}>
              <b>{c.label}</b>
              <small className="muted">{EMOTION_SHAPES[c.id]?.label}</small>
              <FlowerBloom3D flower={soft} size={130} />
              <small>{soft.name}</small>
              <FlowerBloom3D flower={loud} size={130} />
              <small>{loud.name}</small>
            </div>
          )
        })}
      </div>
    </div>
  )
}
