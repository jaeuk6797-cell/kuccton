// Supabase-free test of the actual garden and detail renderers.
import { useCallback, useMemo, useRef, useState } from 'react'
import Island3D from '../components/Island3D.jsx'
import FlowerBloom3D from '../components/FlowerBloom3D.jsx'
import { CATEGORIES, buildFlower, buildSoundFlower } from '../lib/flower.js'
import { toFlowerRow, pairName } from '../lib/naming.js'
import { displayName } from '../lib/tree.js'
import { gardenThemeStorageKey, normalizeGardenTheme, readGardenTheme, writeGardenTheme } from '../lib/gardenThemeStorage.js'
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
const EMPTY = []
const DEMO_THEME_KEY = gardenThemeStorageKey(null, true)
const isMixedFlower = flower => flower.id !== CONTROL_ID && MIXED_CATEGORIES.has(flower.category)
const isProceduralFlower = () => false
const EMOTION_LABELS = { joy: 'Joy', excited: 'Excited', flutter: 'Flutter', cozy: 'Cozy', calm: 'Calm', sad: 'Sad', tense: 'Tense' }
// Use the actual category colors from buildFlower; the pink hero override is not a palette fixture.
const STUDY_FLOWERS = CATEGORIES.map(({ id }, i) => ({
  id, label: EMOTION_LABELS[id], group: 'Emotion flowers',
  flower: row(`study-${id}`, VOICE(id, PEONY.features), 100 + i),
}))
const STUDY_TREES = ['Round tree', 'Pine tree', 'Willow tree'].map((label, i) => ({
  id: ['tree-round', 'tree-pine', 'tree-willow'][i], label, group: 'Sound trees',
  flower: row(`study-tree-${i}`, SAMPLES[6 + i], 110 + i),
}))
const STUDY_PAIR = {
  id: 'pair', label: 'Cozy + Flutter', group: 'Two-color pair', pair: true,
  flower: { ...PAIR_B, petals: Math.min(8, Math.max(PAIR_A.petals, PAIR_B.petals) + 1) },
  colors: [PAIR_A.color, PAIR_B.color],
}
const STUDY_SPECIMENS = [...STUDY_FLOWERS, ...STUDY_TREES, STUDY_PAIR]
const STUDY_GROUPS = [STUDY_FLOWERS, STUDY_TREES, [STUDY_PAIR]]

function updateQuery(values) {
  const url = new URL(location.href)
  for (const [key, value] of Object.entries(values)) {
    if (value == null) url.searchParams.delete(key)
    else url.searchParams.set(key, value)
  }
  history.replaceState(null, '', url)
}

export default function IslandPreview() {
  const params = new URLSearchParams(location.search)
  const [mode, setMode] = useState(() => params.get('flora') === 'mixed' ? 'mixed' : 'original')
  const [dense, setDense] = useState(() => params.get('plants') === '50')
  const [tone, setTone] = useState(() => params.has('tone') ? normalizeGardenTheme(params.get('tone')) : readGardenTheme(DEMO_THEME_KEY))
  const [islandOnly, setIslandOnly] = useState(() => params.get('islandOnly') === '1')
  const [angle, setAngle] = useState(() => params.get('angle') === 'rotated' ? 'rotated' : 'front')
  const [portrait, setPortrait] = useState(() => params.get('portrait') === '1')
  const [still, setStill] = useState(() => params.get('still') === '1')
  const [extra, setExtra] = useState([])
  const [fresh, setFresh] = useState(null)
  const [picked, setPicked] = useState(null)
  const [compare, setCompare] = useState(() => params.get('compare') === '1')
  const [study, setStudy] = useState(() => params.get('study') === 'flora')
  const [specimen, setSpecimen] = useState(() => STUDY_SPECIMENS.find(item => item.id === params.get('specimen'))?.id || 'joy')
  const [reset, setReset] = useState(null)
  const [stats, setStats] = useState(null)
  const seq = useRef(0)
  const flowers = useMemo(() => [...BASE, ...(dense ? DENSE : []), ...extra], [dense, extra])
  const isBlenderFlower = mode === 'mixed' ? isMixedFlower : isProceduralFlower
  const previewTime = still ? 6 : undefined
  const selectedSpecimen = STUDY_SPECIMENS.find(item => item.id === specimen)
  const studyBlender = mode === 'mixed' && selectedSpecimen.flower.category === 'cozy' && !selectedSpecimen.pair

  const setView = (nextMode, nextDense) => {
    updateQuery({ flora: nextMode, plants: nextDense ? '50' : null })
    setMode(nextMode)
    setDense(nextDense)
    if (picked?.id.startsWith('dense-')) setPicked(null)
  }
  const pick = useCallback(flower => {
    updateQuery({ compare: null, study: null, specimen: null })
    setStudy(false)
    setCompare(false)
    setPicked(flower)
  }, [])
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
  const close = () => { updateQuery({ compare: null }); setCompare(false); setPicked(null) }
  const chooseTone = next => { updateQuery({ tone: next }); setTone(next); writeGardenTheme(DEMO_THEME_KEY, next) }
  const toggleStudy = () => {
    updateQuery({ study: study ? null : 'flora', specimen: study ? null : specimen, compare: null })
    setStudy(value => !value)
    setCompare(false)
    setPicked(null)
  }
  const chooseSpecimen = id => { updateQuery({ specimen: id }); setSpecimen(id) }
  const toggleIsland = () => {
    updateQuery({ islandOnly: !islandOnly ? '1' : null, compare: null })
    setIslandOnly(value => !value)
    setCompare(false)
    setPicked(null)
  }
  const resetView = () => {
    updateQuery({ angle: null })
    setAngle('front')
    setReset(value => (value ?? 0) + 1)
  }

  return (
    <main className="flora-preview" data-mode={mode} data-tone={tone} data-portrait={portrait} data-still={still} data-study={study ? 'flora' : undefined}>
      <Island3D
        flowers={islandOnly ? EMPTY : flowers} pairs={islandOnly ? EMPTY : PAIRS} meId={ME} freshIds={fresh} highlightId={picked?.id}
        onPickFlower={pick} onPickPair={pick} resetViewKey={reset}
        isBlenderFlower={isBlenderFlower} onPreviewStats={setStats}
        tone={tone} previewAngle={angle} previewTime={previewTime}
      />
      <header className="flora-toolbar" aria-label="Garden comparison controls">
        <div className="flora-actions" aria-label="Tone comparison">
          <button aria-pressed={tone === 'default'} onClick={() => chooseTone('default')}>Original Opal</button>
          <button aria-pressed={tone === 'warm'} onClick={() => chooseTone('warm')}>Warm Opal</button>
          <button aria-pressed={tone === 'balanced'} onClick={() => chooseTone('balanced')}>Balanced Warm</button>
          <button aria-pressed={tone === 'aurora'} onClick={() => chooseTone('aurora')}>Aurora Crystal</button>
          <button aria-pressed={still} onClick={() => { updateQuery({ still: !still ? '1' : null }); setStill(value => !value) }}>Still frame</button>
        </div>
        <div className="flora-actions">
          <button aria-pressed={mode === 'original'} onClick={() => setView('original', dense)}>Procedural flora</button>
          <button aria-pressed={mode === 'mixed'} onClick={() => setView('mixed', dense)}>Mixed flora</button>
          <button aria-pressed={dense} onClick={() => setView(mode, !dense)}>50 plants</button>
          <button aria-pressed={islandOnly} onClick={toggleIsland}>Island only</button>
        </div>
        <div className="flora-actions">
          <button aria-pressed={angle === 'rotated'} onClick={() => {
            const next = angle === 'front' ? 'rotated' : 'front'
            updateQuery({ angle: next === 'front' ? null : next })
            setAngle(next)
          }}>Rotated view</button>
          <button aria-pressed={portrait} onClick={() => { updateQuery({ portrait: !portrait ? '1' : null }); setPortrait(value => !value) }}>Portrait</button>
          <button onClick={resetView}>Reset view</button>
          <button aria-pressed={study} onClick={toggleStudy}>Palette study</button>
        </div>
        {stats && <output className="flora-stats" data-stats={JSON.stringify(stats)}>
          {stats.plants} plants · {stats.near} near / {stats.far} far · {stats.calls.toLocaleString()} calls · {stats.triangles.toLocaleString()} triangles
        </output>}
      </header>
      <footer className="flora-inspector">
        {study && <section className="flora-card flora-study" aria-label="Palette study" data-study-specimen={specimen}>
          <button className="flora-close" onClick={toggleStudy} aria-label="Close palette study">×</button>
          <h2>Palette study</h2>
          <div className="flora-study-body">
            <nav className="flora-study-nav" aria-label="Study specimens">
              {STUDY_GROUPS.map(group => <div className="flora-study-group" key={group[0].group}>
                <h3>{group[0].group}</h3>
                <div className="flora-actions">
                  {group.map(item => <button key={item.id} aria-pressed={specimen === item.id} onClick={() => chooseSpecimen(item.id)}>{item.label}</button>)}
                </div>
              </div>)}
            </nav>
            <div className="flora-study-detail">
              <FlowerBloom3D flower={selectedSpecimen.flower} colors={selectedSpecimen.colors} pair={selectedSpecimen.pair} size={270}
                blender={studyBlender} closeUp={studyBlender} tone={tone} previewTime={previewTime} />
              <strong>{selectedSpecimen.label}</strong>
              <span>{selectedSpecimen.pair ? 'Two-color procedural flower' : selectedSpecimen.flower.category === 'sound' ? 'Crystal-flora tree' : studyBlender ? 'Blender crystal peony' : 'Procedural flower'}</span>
            </div>
          </div>
        </section>}
        {!study && (compare || picked) && <section className="flora-card" aria-label={compare ? 'Peony comparison' : 'Plant detail'} data-picked={picked?.id}>
          <button className="flora-close" onClick={close} aria-label="Close preview">×</button>
          {compare ? <div className="flora-comparison">
            <div><FlowerBloom3D flower={CONTROL} size={216} closeUp blender={false} tone={tone} previewTime={previewTime} /><strong>Procedural peony</strong></div>
            <div><FlowerBloom3D flower={HERO} size={216} closeUp blender={mode === 'mixed'} tone={tone} previewTime={previewTime} /><strong>{mode === 'mixed' ? 'Crystal peony' : 'Procedural peony'}</strong></div>
          </div> : <>
            {picked === PAIR
              ? <FlowerBloom3D flower={{ ...PAIR_B, petals: Math.min(8, Math.max(PAIR_A.petals, PAIR_B.petals) + 1) }} colors={[PAIR_A.color, PAIR_B.color]} pair size={148} tone={tone} previewTime={previewTime} />
              : <FlowerBloom3D flower={picked} size={148} blender={Boolean(isBlenderFlower?.(picked))} closeUp={isBlenderFlower?.(picked)} tone={tone} previewTime={previewTime} />}
            <strong>{displayName(picked)}</strong>
            {picked.transcript && <div>꽃말: “{picked.transcript}”</div>}
          </>}
        </section>}
        <div className="flora-actions">
          <button onClick={() => { updateQuery({ compare: '1', study: null, specimen: null }); setStudy(false); setPicked(null); setCompare(true) }}>Compare peonies</button>
          <button disabled={islandOnly} onClick={add}>Plant peony</button>
          <button disabled={!extra.length} onClick={remove}>Remove last</button>
        </div>
      </footer>
    </main>
  )
}
