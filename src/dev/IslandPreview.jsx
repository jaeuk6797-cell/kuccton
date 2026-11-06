// 개발용: Supabase 없이 3D 정원만 확인하는 화면.  npm run dev → http://localhost:5173/?view=island
// 실제 앱과 같은 naming.js 규칙으로 가짜 flowers / pair_flowers 행을 만들어 Island3D에 넣는다.
import { useMemo, useState } from 'react'
import Island3D from '../components/Island3D.jsx'
import FlowerBloom3D from '../components/FlowerBloom3D.jsx'
import { buildFlower, buildSoundFlower } from '../lib/flower.js'
import { toFlowerRow, pairName } from '../lib/naming.js'

const ME = 'me'
const PARTNER = 'partner'
const DAY = 86400000

// 파형 윤곽(envelope): 꽃잎별 길이에 쓰인다
const env = (...v) => v
// [종류, 감정 카테고리(목소리만), 음향 특징, 꽃말]
const SAMPLES = [
  ['sound', null, { rms: 0.03, centroid: 3200, attack: 0.6, onsets: 3, sustain: 0.2, envelope: env(0.9, 0.3, 0.8, 0.2, 0.7, 0.1) }, null],
  ['voice', 'flutter', { rms: 0.02, centroid: 2600, attack: 0.1, onsets: 3, sustain: 0.6, envelope: env(0.4, 0.6, 0.5, 0.7, 0.4) }, '오늘도 고생했어'],
  ['voice', 'joy', { rms: 0.09, centroid: 2500, attack: 0.55, onsets: 5, sustain: 0.4, envelope: env(1, 0.6, 0.9, 0.5, 0.8, 0.4) }, '하하 진짜 웃기다'],
  ['voice', 'calm', { rms: 0.12, centroid: 1500, attack: 0.3, onsets: 6, sustain: 0.7, envelope: env(0.6, 0.7, 0.6, 0.8, 0.7, 0.6) }, '저녁 맛있게 먹어!'],
  ['sound', null, { rms: 0.12, centroid: 1200, attack: 0.3, onsets: 2, sustain: 0.3, envelope: env(1, 0.4, 0.9, 0.3) }, null],
  ['sound', null, { rms: 0.04, centroid: 3600, attack: 0.1, onsets: 1, sustain: 0.9, envelope: env(0.5, 0.7, 0.8, 0.7, 0.6) }, null],
  ['voice', 'cozy', { rms: 0.03, centroid: 1800, attack: 0.1, onsets: 2, sustain: 0.8, envelope: env(0.5, 0.6, 0.5) }, '잘 자'],
  ['sound', null, { rms: 0.05, centroid: 3000, attack: 0.7, onsets: 7, sustain: 0.1, envelope: env(1, 0.2, 0.9, 0.3, 1, 0.2, 0.8) }, null],
]

let seq = 0
function row(sender, [kind, category, features, transcript], time) {
  const flower = kind === 'voice' ? buildFlower(category, features, 1) : buildSoundFlower(features)
  return {
    id: `mock-${seq++}`, sender_id: sender,
    ...toFlowerRow({ flower, features, kind, category, transcript }),
    sent_date: new Date(time).toISOString().slice(0, 10), created_at: new Date(time).toISOString(),
  }
}

// 같은 날 두 사람이 각각 처음 보낸 꽃끼리 하루에 하나 (db.js 규칙과 동일)
function pairsOf(flowers) {
  const byDate = {}
  for (const f of [...flowers].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const d = (byDate[f.sent_date] ||= {})
    d[f.sender_id] ||= f
  }
  return Object.entries(byDate)
    .filter(([, d]) => d[ME] && d[PARTNER])
    .map(([date, d]) => {
      const [a, b] = [d[ME], d[PARTNER]].sort((x, y) => x.created_at.localeCompare(y.created_at))
      return { id: `pair-${date}`, flower_a_id: a.id, flower_b_id: b.id, name: pairName(a.root, b.root), sent_date: date }
    })
}

function initial() {
  const now = Date.now()
  const plan = [[3, ME, 0], [3, PARTNER, 1], [2, PARTNER, 2], [1, ME, 5], [1, PARTNER, 3], [1, ME, 7], [0, PARTNER, 4]]
  return plan.map(([d, s, i], k) => row(s, SAMPLES[i], now - d * DAY + k * 60000))
}

export default function IslandPreview() {
  const [flowers, setFlowers] = useState(initial)
  const [fresh, setFresh] = useState(() => new Set())
  const [picked, setPicked] = useState(null)
  const pairs = useMemo(() => pairsOf(flowers), [flowers])

  const add = (sender) => {
    const f = row(sender, SAMPLES[Math.floor(Math.random() * SAMPLES.length)], Date.now())
    setFlowers((l) => [...l, f])
    setFresh(new Set([f.id]))
    setPicked(f)
  }

  return (
    <div className="screen" style={{ background: 'linear-gradient(180deg, #f7d6e6 0%, #d9ccf5 50%, #bfe8e3 100%)' }}>
      <Island3D
        flowers={flowers} pairs={pairs} meId={ME} freshIds={fresh} highlightId={picked?.id}
        onPickFlower={setPicked} onPickPair={setPicked}
      />
      <div style={{ position: 'absolute', left: 16, right: 16, bottom: 16, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
        {picked && (
          <div style={{ background: 'rgba(255,255,255,.88)', borderRadius: 14, padding: '10px 14px', maxWidth: 420, width: '100%', fontSize: 14 }}>
            {picked.color && <FlowerBloom3D flower={picked} size={120} />}
            <strong>{picked.name}</strong>
            {picked.reason && <div>{picked.reason}</div>}
            {picked.transcript && <div>꽃말: “{picked.transcript}”</div>}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="ghost" onClick={() => add(PARTNER)}>상대 꽃 받기</button>
          <button className="primary" onClick={() => add(ME)}>내 꽃 보내기</button>
        </div>
      </div>
    </div>
  )
}
