import { useCallback, useEffect, useMemo, useState } from 'react'
import Flower from './Flower.jsx'
import Island3D from './Island3D.jsx'
import Recorder from './Recorder.jsx'
import { FlowerDetail, PairDetail } from './Details.jsx'
import { Bell, Disc, Heart, Mic, Sprout, User, Users, Wave } from './Icons.jsx'
import { deleteFlower, ensurePairs, insertFlower, loadGarden, subscribeGarden, today, uploadAudio } from '../lib/db.js'

// 받침에 따라 조사 고르기
const hasBatchim = (w = '') => {
  const c = w.charCodeAt(w.length - 1)
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0
}
const josa = (w, a, b) => `${w}${hasBatchim(w) ? a : b}`
const timeOfDay = (iso) => {
  const h = new Date(iso).getHours()
  return h < 5 ? '새벽' : h < 11 ? '아침' : h < 17 ? '낮' : h < 21 ? '저녁' : '밤'
}

export default function Garden({ session, onLeave }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('garden')
  const [recording, setRecording] = useState(false)
  const [openFlower, setOpenFlower] = useState(null)
  const [openPair, setOpenPair] = useState(null)
  const [showBell, setShowBell] = useState(false)
  const [toast, setToast] = useState('')
  const [fresh, setFresh] = useState(() => new Set())
  const [highlight, setHighlight] = useState(null)
  const meId = session.memberId

  const refresh = useCallback(async () => {
    try {
      const d = await loadGarden(session.gardenId)
      if (await ensurePairs(d)) Object.assign(d, await loadGarden(session.gardenId))
      setData(d)
    } catch (e) {
      console.error(e)
      setError(e.message || String(e))
    }
  }, [session.gardenId])

  useEffect(() => {
    refresh()
    return subscribeGarden(session.gardenId, (kind, row) => {
      if (kind === 'flower' && row.sender_id !== meId) { markFresh(row.id); showToast(`${row.name}이 피었어요`) }
      if (kind === 'pair') { markFresh(row.id); showToast(`우리의 꽃 ‘${row.name}’이 피었어요`) }
      refresh()
    })
  }, [session.gardenId, meId, refresh])

  function markFresh(id) {
    setFresh((s) => new Set(s).add(id))
    setTimeout(() => setFresh((s) => { const n = new Set(s); n.delete(id); return n }), 5000)
  }
  function showToast(t) {
    setToast(t)
    setTimeout(() => setToast(''), 3500)
  }

  async function handleSend(payload) {
    const { blob, ...fields } = payload
    const audio_path = await uploadAudio(session.gardenId, blob)
    const row = await insertFlower({ ...fields, audio_path, garden_id: session.gardenId, sender_id: meId, sent_date: today() })
    markFresh(row.id)
    setRecording(false)
    setTab('garden')
    await refresh()
  }

  async function handleDelete(flower) {
    await deleteFlower(flower)
    setOpenFlower(null)
    await refresh()
  }

  // F8 오늘의 위로: 상대가 보낸 과거 소리 하나를 무작위로 재생하고 그 꽃을 강조
  function comfort() {
    const theirs = data.flowers.filter((f) => f.sender_id !== meId)
    if (!theirs.length) { showToast('아직 받은 소리가 없어요'); return }
    const f = theirs[Math.floor(Math.random() * theirs.length)]
    setHighlight(f.id)
    setTimeout(() => setHighlight(null), 8000)
    setOpenFlower(f)
  }

  const derived = useMemo(() => {
    if (!data) return null
    const me = data.members.find((m) => m.id === meId)
    const partner = data.members.find((m) => m.id !== meId)
    const t = today()
    const todayMine = data.flowers.find((f) => f.sender_id === meId && f.sent_date === t)
    const todayTheirs = data.flowers.find((f) => f.sender_id !== meId && f.sent_date === t)
    const todayPair = data.pairs.find((p) => p.sent_date === t)
    const days = Math.floor((Date.now() - new Date(data.garden.created_at).getTime()) / 86400000) + 1
    return { me, partner, todayMine, todayTheirs, todayPair, days }
  }, [data, meId])

  if (error) return (
    <div className="screen center-col">
      <p className="error">정원을 불러오지 못했어요: {error}</p>
      <button className="ghost" onClick={onLeave}>처음으로</button>
    </div>
  )
  if (!data) return <div className="home loading center-col"><div className="seed" /><p>정원으로 가는 중…</p></div>

  const { me, partner, todayMine, todayTheirs, todayPair, days } = derived
  const pName = partner?.nickname
  const flowerById = Object.fromEntries(data.flowers.map((f) => [f.id, f]))

  let status
  if (!partner) status = { title: `정원 코드 ${data.garden.code}`, sub: '이 코드를 소중한 사람에게 알려 주세요' }
  else if (todayPair) status = { title: `오늘 ‘${todayPair.name}’이 피었어요`, sub: '눌러서 두 소리를 함께 들어 보세요', onClick: () => setOpenPair(todayPair) }
  else if (todayTheirs && !todayMine) status = { title: `${josa(pName, '이', '가')} ${timeOfDay(todayTheirs.created_at)} 소리를 보냈어요`, sub: '나도 보내면 두 소리가 만나 우리의 꽃이 피어요' }
  else if (todayMine && !todayTheirs) status = { title: '오늘의 소리를 보냈어요', sub: `${pName}의 소리를 기다리고 있어요` }
  else status = { title: '오늘은 아직 조용해요', sub: '지금 들리는 소리를 먼저 건네 볼까요?' }

  const received = data.flowers.filter((f) => f.sender_id !== meId).slice(-8).reverse()

  return (
    <div className="home">
      <div className="sky">
        <div className="cloud c1" /><div className="cloud c2" /><div className="cloud c3" />
      </div>

      {tab === 'garden' && (
        <>
          <Island3D
            flowers={data.flowers}
            pairs={data.pairs}
            meId={meId}
            freshIds={fresh}
            highlightId={highlight}
            onPickFlower={setOpenFlower}
            onPickPair={setOpenPair}
          />
          <header className="home-head">
            <div className="brand"><Sprout /> 소리숲</div>
            <button className="round-btn" onClick={() => setShowBell(true)} aria-label="알림">
              <Bell />
              {received.some((f) => fresh.has(f.id)) && <i className="badge" />}
            </button>
          </header>
          <div className="home-title">
            <h1>{partner ? `${josa(pName, '과', '와')} 나의 정원` : `${me?.nickname}의 정원`}</h1>
            <div className="chips">
              <span>함께 {days}일째</span>
              <span>소리 꽃 {data.flowers.length}송이</span>
              <span>우리의 꽃 {data.pairs.length}송이</span>
            </div>
          </div>
          <div className="hint">꽃을 누르면 그날의 소리가 들려요 · 드래그로 둘러보기</div>

          <section className="home-sheet">
            <div className="grip" />
            <button className="status" onClick={status.onClick} disabled={!status.onClick}>
              <div className="avatars">
                <span className="av partner">{partner ? [...pName][0] : '?'}</span>
                <span className="av me">나</span>
              </div>
              <div className="status-text">
                <b>{status.title}</b>
                <small>{status.sub}</small>
              </div>
            </button>
            <button className="record-cta" onClick={() => setRecording(true)}>
              <Mic /> 오늘의 소리 녹음하기 · 10초
            </button>
            <div className="sub-actions">
              <button onClick={comfort}><Heart /> 오늘의 위로</button>
              <button onClick={() => setTab('album')}><Disc /> 이번 주 소리 앨범</button>
            </div>
          </section>
        </>
      )}

      {tab === 'album' && <Album data={data} meId={meId} onOpen={setOpenFlower} onOpenPair={setOpenPair} flowerById={flowerById} />}
      {tab === 'friends' && <Friends data={data} partner={partner} me={me} />}
      {tab === 'me' && <Me me={me} data={data} onLeave={onLeave} />}

      <nav className="tabbar">
        {[
          ['garden', Sprout, '정원'],
          ['album', Wave, '앨범'],
          ['friends', Users, '친구'],
          ['me', User, '나'],
        ].map(([id, Icon, label]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            <Icon /> <span>{label}</span>
          </button>
        ))}
      </nav>

      {toast && <div className="toast">{toast}</div>}
      {recording && <Recorder onClose={() => setRecording(false)} onSend={handleSend} />}
      {openFlower && (
        <FlowerDetail
          flower={openFlower}
          sender={data.members.find((m) => m.id === openFlower.sender_id)}
          mine={openFlower.sender_id === meId}
          onClose={() => setOpenFlower(null)}
          onDelete={handleDelete}
        />
      )}
      {openPair && flowerById[openPair.flower_a_id] && flowerById[openPair.flower_b_id] && (
        <PairDetail
          pair={openPair}
          flowerA={flowerById[openPair.flower_a_id]}
          flowerB={flowerById[openPair.flower_b_id]}
          meId={meId}
          members={data.members}
          onClose={() => setOpenPair(null)}
        />
      )}
      {showBell && (
        <div className="sheet-backdrop" onClick={() => setShowBell(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setShowBell(false)} aria-label="닫기">×</button>
            <h2 className="sheet-title">받은 소리</h2>
            {received.length === 0 && <p className="muted">아직 받은 소리가 없어요.</p>}
            <ul className="list">
              {received.map((f) => (
                <li key={f.id}>
                  <button onClick={() => { setShowBell(false); setOpenFlower(f) }}>
                    <Flower flower={f} size={40} stem={false} bloom={false} />
                    <div><b>{f.name}</b><small>{formatDate(f.sent_date)} {timeOfDay(f.created_at)}</small></div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

function Album({ data, meId, onOpen, onOpenPair, flowerById }) {
  const rows = useMemo(() => {
    const byDate = {}
    for (const f of data.flowers) (byDate[f.sent_date] ||= { date: f.sent_date, list: [], pair: null }).list.push(f)
    for (const p of data.pairs) if (byDate[p.sent_date]) byDate[p.sent_date].pair = p
    return Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date))
  }, [data])
  const weekAgo = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)
  const week = rows.filter((r) => r.date >= weekAgo)
  const older = rows.filter((r) => r.date < weekAgo)

  const Day = ({ r }) => (
    <div className="album-day">
      <div className="album-date">{formatDate(r.date)}</div>
      <div className="album-flowers">
        {r.pair && flowerById[r.pair.flower_a_id] && flowerById[r.pair.flower_b_id] && (
          <button className="album-item pair" onClick={() => onOpenPair(r.pair)}>
            <Flower flower={flowerById[r.pair.flower_b_id]} colors={[flowerById[r.pair.flower_a_id].color, flowerById[r.pair.flower_b_id].color]} size={52} stem={false} glow />
            <b>{r.pair.name}</b><small>우리의 꽃</small>
          </button>
        )}
        {r.list.map((f) => (
          <button key={f.id} className="album-item" onClick={() => onOpen(f)}>
            <Flower flower={f} size={46} stem={false} />
            <b>{f.name}</b>
            <small>{f.sender_id === meId ? '내가 보냄' : '받음'}</small>
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <div className="page">
      <h1 className="page-title">이번 주 소리 앨범</h1>
      {week.length === 0 && <p className="muted">이번 주에는 아직 핀 꽃이 없어요.</p>}
      {week.map((r) => <Day key={r.date} r={r} />)}
      {older.length > 0 && <h2 className="page-sub">지난 소리</h2>}
      {older.map((r) => <Day key={r.date} r={r} />)}
    </div>
  )
}

function Friends({ data, partner, me }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(data.garden.code); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch {}
  }
  return (
    <div className="page">
      <h1 className="page-title">함께 가꾸는 사람</h1>
      <div className="card person">
        <span className="av partner big">{partner ? [...partner.nickname][0] : '?'}</span>
        <div>
          <b>{partner ? partner.nickname : '아직 혼자예요'}</b>
          <small className="muted">{partner ? `${data.flowers.filter((f) => f.sender_id === partner.id).length}송이를 보냈어요` : '정원 코드를 알려 주면 함께할 수 있어요'}</small>
        </div>
      </div>
      <div className="card person">
        <span className="av me big">나</span>
        <div>
          <b>{me?.nickname}</b>
          <small className="muted">{data.flowers.filter((f) => f.sender_id === me?.id).length}송이를 보냈어요</small>
        </div>
      </div>
      <div className="card code-card">
        <small className="muted">정원 코드</small>
        <div className="big-code">{data.garden.code}</div>
        <button className="ghost" onClick={copy}>{copied ? '복사했어요' : '코드 복사'}</button>
      </div>
    </div>
  )
}

function Me({ me, data, onLeave }) {
  return (
    <div className="page">
      <h1 className="page-title">나</h1>
      <div className="card person">
        <span className="av me big">나</span>
        <div><b>{me?.nickname}</b><small className="muted">정원 코드 {data.garden.code}</small></div>
      </div>
      <div className="card">
        <p className="small">녹음은 우리 두 사람만 들을 수 있어요. 내가 보낸 꽃은 꽃을 눌러 언제든 지울 수 있어요.</p>
      </div>
      <button className="ghost wide" onClick={onLeave}>이 기기에서 정원 나가기</button>
    </div>
  )
}

function formatDate(d) {
  if (d === today()) return '오늘'
  const [, m, day] = d.split('-')
  return `${Number(m)}월 ${Number(day)}일`
}
