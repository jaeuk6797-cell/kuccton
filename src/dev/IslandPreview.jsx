// 개발용: Supabase 없이 3D 정원만 확인하는 화면.  npm run dev → http://localhost:5173/?view=island
// 실제 앱과 같은 naming.js 규칙으로 가짜 flowers / pair_flowers 행을 만들어 Island3D에 넣는다.
import { useMemo, useState } from 'react'
import Island3D from '../components/Island3D.jsx'
import { makeName, flowerLook, pairName } from '../lib/naming.js'

const ME = 'me'
const PARTNER = 'partner'
const DAY = 86400000

const SAMPLES = [
  ['rain', { rms: 0.03, centroid: 3200, attack: 0.7, onsets: 3 }, null],
  ['whisper', { rms: 0.02, centroid: 2600, attack: 0.1, onsets: 3 }, '오늘도 고생했어'],
  ['laughter', { rms: 0.09, centroid: 2500, attack: 0.5, onsets: 5 }, null],
  ['speech', { rms: 0.12, centroid: 1500, attack: 0.4, onsets: 6 }, '저녁 맛있게 먹어!'],
  ['dog', { rms: 0.11, centroid: 1400, attack: 0.2, onsets: 2 }, null],
  ['bird', { rms: 0.03, centroid: 3800, attack: 0.5, onsets: 4 }, null],
  ['vehicle', { rms: 0.14, centroid: 900, attack: 0.7, onsets: 2 }, null],
  ['typing', { rms: 0.04, centroid: 3000, attack: 0.7, onsets: 6 }, null],
  ['singing', { rms: 0.06, centroid: 2100, attack: 0.2, onsets: 3 }, '랄라~'],
  ['water', { rms: 0.05, centroid: 2400, attack: 0.1, onsets: 2 }, null],
]

let seq = 0
function row(sender, [category, features, transcript], time) {
  const n = makeName(category, features)
  const look = flowerLook(category, features, n.axes)
  return {
    id: `mock-${seq++}`, sender_id: sender, category, root: n.root, name: n.name, reason: n.reason, transcript,
    ...features, vowel: n.axes.vowel, consonant: n.axes.consonant, color: look.color, petals: look.petals,
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
