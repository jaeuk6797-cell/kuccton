// Supabase-free test of the actual garden and detail renderers.
import { useCallback, useMemo, useRef, useState } from 'react'
import Island3D from '../components/Island3D.jsx'
import FlowerBloom3D from '../components/FlowerBloom3D.jsx'
import { buildFlower, buildSoundFlower } from '../lib/flower.js'
import { toFlowerRow, pairName } from '../lib/naming.js'
import { displayName } from '../lib/tree.js'
import './IslandPreview.css'

const ME = 'me'
const PARTNER = 'partner'
const DAY = 86400000
const START = Date.UTC(2026, 0, 1)
const MIXED_CATEGORIES = new Set(['cozy'])
// Hash to two foreground slots at the same depth through the garden's usual placement rules.
const CONTROL_ID = 'peony-procedural-89'
const HERO_ID = 'peony-blender-41'

const VOICE = (category, features, transcript) => ({ kind: 'voice', category, features, transcript })
const SOUND = features => ({ kind: 'sound', features: { envelope: [0.9, 0.5, 0.75, 0.4, 0.6], ...features } })
const PEONY = VOICE('cozy', { rms: 0.035, centroid: 2800, attack: 0.1, onsets: 6, sustain: 0.8, envelope: [0.7, 0.6, 0.9, 0.55, 0.8, 0.65] }, '잘 자')
const PEONY_COLORS = ['#edacc9', '#89cdbd', '#a597dd']
const SAMPLES = [
  VOICE('flutter', { rms: 0.02, centroid: 2600, attack: 0.1, onsets: 3, sustain: 0.6 }, '오늘도 고생했어'),
  VOICE('joy', { rms: 0.09, centroid: 2500, attack: 0.55, onsets: 5, sustain: 0.4 }, '하하 진짜 웃기다'),
  VOICE('calm', { rms: 0.12, centroid: 1500, attack: 0.3, onsets: 6, sustain: 0.7 }, '저녁 맛있게 먹어!'),
  VOICE('excited', { rms: 0.09, centroid: 3100, attack: 0.68, onsets: 5, sustain: 0.25 }),
  VOICE('sad', { rms: 0.025, centroid: 1500, attack: 0.15, onsets: 4, sustain: 0.6 }),
  VOICE('tense', { rms: 0.04, centroid: 3300, attack: 0.32, onsets: 5, sustain: 0.25 }),
  SOUND({ rms: 0.03, centroid: 3200, attack: 0.17, onsets: 3, sustain: 0.2 }),
  SOUND({ rms: 0.05, centroid: 3000, attack: 0.7, onsets: 7, sustain: 0.1 }),
  SOUND({ rms: 0.04, centroid: 3600, attack: 0.1, onsets: 1, sustain: 0.9 }),
]

function row(id, sample, day, sender = PARTNER, offset = 0) {
  const { kind, category, features, transcript } = sample
  const flower = kind === 'voice' ? buildFlower(category, features, 1) : buildSoundFlower(features)
  const time = new Date(START + day * DAY + offset).toISOString()
  return {
    id, sender_id: sender,
    ...toFlowerRow({ flower, features, kind, category, transcript }),
    sent_date: time.slice(0, 10), created_at: time,
  }
}

function peony(id, day, color) {
  return { ...row(id, PEONY, day), color }
}

const CONTROL = peony(CONTROL_ID, 1, PEONY_COLORS[0])
const HERO = peony(HERO_ID, 2, PEONY_COLORS[0])
const PAIR_A = row('pair-source', PEONY, 0, ME)
const PAIR_B = row('pair-flutter', SAMPLES[0], 0, PARTNER, 1000)
const PAIR = {
  id: 'demo-pair', flower_a_id: PAIR_A.id, flower_b_id: PAIR_B.id,
  name: pairName(PAIR_A.root, PAIR_B.root), sent_date: PAIR_A.sent_date,
}
const BASE = [PAIR_A, PAIR_B, CONTROL, HERO, peony('peony-jade-16', 3, PEONY_COLORS[1]),
  ...SAMPLES.slice(1).map((sample, i) => row(`sample-${i}`, sample, i + 4))]
const DENSE = Array.from({ length: 50 - BASE.length }, (_, i) => i % 4 === 0
  ? peony(`dense-peony-${i}`, 20 + i, PEONY_COLORS[(i / 4) % PEONY_COLORS.length])
  : row(`dense-${i}`, SAMPLES[i % SAMPLES.length], 20 + i))
const PAIRS = [PAIR]
const isMixedFlower = flower => flower.id !== CONTROL_ID && MIXED_CATEGORIES.has(flower.category)

export default function IslandPreview() {
  const params = new URLSearchParams(location.search)
  const [mode, setMode] = useState(() => params.get('flora') === 'mixed' ? 'mixed' : 'original')
  const [dense, setDense] = useState(() => params.get('plants') === '50')
  const [extra, setExtra] = useState([])
  const [fresh, setFresh] = useState(null)
  const [picked, setPicked] = useState(null)
  const [compare, setCompare] = useState(false)
  const [reset, setReset] = useState(null)
  const [stats, setStats] = useState(null)
  const seq = useRef(0)
  const flowers = useMemo(() => [...BASE, ...(dense ? DENSE : []), ...extra], [dense, extra])
  const isBlenderFlower = mode === 'mixed' ? isMixedFlower : undefined

  const setView = (nextMode, nextDense) => {
    const url = new URL(location.href)
    url.searchParams.set('flora', nextMode)
    if (nextDense) url.searchParams.set('plants', '50')
    else url.searchParams.delete('plants')
    history.replaceState(null, '', url)
    setMode(nextMode)
    setDense(nextDense)
    if (picked?.id.startsWith('dense-')) setPicked(null)
  }
  const pick = useCallback(flower => { setCompare(false); setPicked(flower) }, [])
  const add = () => {
    const i = seq.current++
    const flower = peony(`fresh-peony-${i}`, 80 + i, PEONY_COLORS[i % PEONY_COLORS.length])
    setExtra(list => [...list, flower])
    setFresh(new Set([flower.id]))
  }
  const remove = () => {
    if (picked === extra.at(-1)) setPicked(null)
    setExtra(list => list.slice(0, -1))
    setFresh(null)
  }
  const close = () => { setCompare(false); setPicked(null) }

  return (
    <main className="flora-preview" data-mode={mode}>
      <Island3D
        flowers={flowers} pairs={PAIRS} meId={ME} freshIds={fresh} highlightId={picked?.id}
        onPickFlower={pick} onPickPair={pick} resetViewKey={reset}
        isBlenderFlower={isBlenderFlower} onPreviewStats={setStats}
      />
      <header className="flora-toolbar" aria-label="Garden comparison controls">
        <div className="flora-actions">
          <button aria-pressed={mode === 'original'} onClick={() => setView('original', dense)}>Original</button>
          <button aria-pressed={mode === 'mixed'} onClick={() => setView('mixed', dense)}>Mixed</button>
          <button aria-pressed={dense} onClick={() => setView(mode, !dense)}>50 plants</button>
          <button onClick={() => setReset(value => (value ?? 0) + 1)}>Reset view</button>
        </div>
        {stats && <output className="flora-stats" data-stats={JSON.stringify(stats)}>
          {stats.plants} plants · {stats.near} near / {stats.far} far · {stats.calls.toLocaleString()} calls · {stats.triangles.toLocaleString()} triangles
        </output>}
      </header>
      <footer className="flora-inspector">
        {(compare || picked) && <section className="flora-card" aria-label={compare ? 'Peony comparison' : 'Plant detail'} data-picked={picked?.id}>
          <button className="flora-close" onClick={close} aria-label="Close preview">×</button>
          {compare ? <div className="flora-comparison">
            <div><FlowerBloom3D flower={CONTROL} size={216} closeUp /><strong>Procedural peony</strong></div>
            <div><FlowerBloom3D flower={HERO} size={216} closeUp blender={mode === 'mixed'} /><strong>{mode === 'mixed' ? 'Crystal peony' : 'Procedural peony'}</strong></div>
          </div> : <>
            {picked === PAIR
              ? <FlowerBloom3D flower={{ ...PAIR_B, petals: Math.min(8, Math.max(PAIR_A.petals, PAIR_B.petals) + 1) }} colors={[PAIR_A.color, PAIR_B.color]} pair size={148} />
              : <FlowerBloom3D flower={picked} size={148} blender={isBlenderFlower?.(picked)} closeUp={isBlenderFlower?.(picked)} />}
            <strong>{displayName(picked)}</strong>
            {picked.transcript && <div>꽃말: “{picked.transcript}”</div>}
          </>}
        </section>}
        <div className="flora-actions">
          <button onClick={() => { setPicked(null); setCompare(true) }}>Compare peonies</button>
          <button onClick={add}>Plant peony</button>
          <button disabled={!extra.length} onClick={remove}>Remove last</button>
        </div>
      </footer>
    </main>
  )
}
