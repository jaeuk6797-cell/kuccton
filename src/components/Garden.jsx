import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Flower from './Flower.jsx'
import Island3D from './Island3D.jsx'
import Recorder from './Recorder.jsx'
import { FlowerDetail, PairDetail } from './Details.jsx'
import { displayName, grewText, isTree } from '../lib/tree.js'
import { Bell, Heart, Mic, Sprout, User, Users, Wave } from './Icons.jsx'
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

export default function Garden({ session, onSignOut, email }) {
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
  // 녹음 카드: 아래로 끌어내리면 접혀서 정원을 크게 본다 (접힌 상태는 기기에 기억)
  const SHEET_PEEK = 78
  const [sheetOpen, setSheetOpen] = useState(() => localStorage.getItem('sup.sheet') !== 'closed')
  const sheetRef = useRef(null)
  const homeRef = useRef(null)
  const dragRef = useRef(null)
  useEffect(() => { localStorage.setItem('sup.sheet', sheetOpen ? 'open' : 'closed') }, [sheetOpen])
  const [hintOn, setHintOn] = useState(true) // 처음 몇 초만 보여 주는 조작 안내
  useEffect(() => {
    const t = setTimeout(() => setHintOn(false), 4500)
    return () => clearTimeout(t)
  }, [])

  // 카드 높이와 '열렸을 때 섬 축소 비율'을 CSS 변수로 둔다. 섬은 캔버스 크기를 바꾸지 않고
  // CSS transform으로만 줄었다 커져서(3D를 다시 그리지 않음) 접고 펼 때 끊기지 않는다.
  const hasSheet = Boolean(data) && tab === 'garden'
  useLayoutEffect(() => {
    const home = homeRef.current, sheet = sheetRef.current
    if (!home || !sheet) return
    const measure = () => {
      const tabH = home.querySelector('.tabbar')?.offsetHeight ?? 64
      const sheetH = sheet.offsetHeight
      const top = 140
      const closedH = home.clientHeight - top - tabH - SHEET_PEEK + 8
      const openH = home.clientHeight - top - tabH - sheetH + 15
      home.style.setProperty('--sheet-h', `${sheetH}px`)
      home.style.setProperty('--island-s', String(Math.min(1, Math.max(0.5, openH / closedH))))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(home); ro.observe(sheet)
    return () => ro.disconnect()
  }, [hasSheet])
  const meId = session.memberId

  const refresh = useCallback(async () => {
    setError('')
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
      if (kind === 'flower' && row.sender_id !== meId) { markFresh(row.id); showToast(grewText(row)) }
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
      <div className="row">
        <button className="ghost" onClick={refresh}>다시 시도</button>
        <button className="ghost" onClick={onSignOut}>로그아웃</button>
      </div>
    </div>
  )
  if (!data) return <div className="home loading center-col"><div className="seed" /><p>정원으로 가는 중…</p></div>

  const { me, partner, todayMine, todayTheirs, todayPair, days } = derived
  const pName = partner?.nickname
  const flowerById = Object.fromEntries(data.flowers.map((f) => [f.id, f]))

  let status
  // 정원 코드는 홈에 띄우지 않고 친구 탭에서만 보여 준다
  if (!partner) status = { title: '아직 혼자 가꾸는 정원이에요', sub: '친구 탭에서 정원 코드를 알려 줄 수 있어요', onClick: () => setTab('friends') }
  else if (todayPair) status = { title: `오늘 ‘${todayPair.name}’이 피었어요`, sub: '눌러서 두 소리를 함께 들어 보세요', onClick: () => setOpenPair(todayPair) }
  else if (todayTheirs && !todayMine) status = { title: `${josa(pName, '이', '가')} ${timeOfDay(todayTheirs.created_at)} 소리를 보냈어요`, sub: '나도 보내면 두 소리가 만나 우리의 꽃이 피어요' }
  else if (todayMine && !todayTheirs) status = { title: '오늘의 소리를 보냈어요', sub: `${pName}의 소리를 기다리고 있어요` }
  else status = { title: '오늘은 아직 조용해요', sub: '지금 들리는 소리를 먼저 건네 볼까요?' }

  const received = data.flowers.filter((f) => f.sender_id !== meId).slice(-8).reverse()

  // 손잡이를 끌면 카드·섬·안내 문구가 함께 손가락을 따라오고(--sheet-p: 0 열림 ~ 1 접힘),
  // 놓으면 가까운 쪽으로 부드럽게 붙는다. 빠르게 튕기면 짧게 끌어도 넘어간다. 살짝 누르면 토글
  const onHandleDown = (e) => {
    dragRef.current = { y: e.clientY, dy: 0, t: performance.now(), v: 0, h: sheetRef.current.offsetHeight - SHEET_PEEK }
    e.currentTarget.setPointerCapture(e.pointerId)
    homeRef.current.classList.add('dragging')
  }
  const onHandleMove = (e) => {
    const d = dragRef.current
    if (!d) return
    const now = performance.now()
    const dy = e.clientY - d.y
    d.v = (dy - d.dy) / Math.max(1, now - d.t) // px/ms
    d.dy = dy; d.t = now
    const p = Math.min(1, Math.max(0, (sheetOpen ? 0 : 1) + dy / d.h))
    homeRef.current.style.setProperty('--sheet-p', p.toFixed(4))
  }
  const onHandleUp = () => {
    const d = dragRef.current
    dragRef.current = null
    const home = homeRef.current
    if (!home || !d) return
    home.classList.remove('dragging')
    home.style.removeProperty('--sheet-p') // 클래스 값(0/1)으로 전환 애니메이션
    const p = (sheetOpen ? 0 : 1) + d.dy / d.h
    if (Math.abs(d.dy) < 6) setSheetOpen((o) => !o)
    else if (Math.abs(d.v) > 0.5) setSheetOpen(d.v < 0)
    else setSheetOpen(p < 0.5)
  }

  return (
    <div ref={homeRef} className={`home ${sheetOpen ? '' : 'sheet-closed'}`}>
      <div className="sky">
        <div className="cloud c1" /><div className="cloud c2" /><div className="cloud c3" />
      </div>

      {tab === 'garden' && (
        <>
          <div className="island-touch" onPointerDown={() => setHintOn(false)}>
          <Island3D
            flowers={data.flowers}
            pairs={data.pairs}
            meId={meId}
            freshIds={fresh}
            highlightId={highlight}
            onPickFlower={setOpenFlower}
            onPickPair={setOpenPair}
          />
          </div>
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
              <span>꽃 {data.flowers.filter((f) => !isTree(f)).length}송이</span>
              {data.flowers.some(isTree) && <span>나무 {data.flowers.filter(isTree).length}그루</span>}
              <span>우리의 꽃 {data.pairs.length}송이</span>
            </div>
          </div>
          {data.flowers.length === 0 ? (
            <div className="empty-garden">
              <b>아직 핀 꽃이 없어요</b>
              <small>{partner ? '지금 들리는 소리를 처음으로 남겨 보세요' : '혼자서도 먼저 소리를 심어 둘 수 있어요'}</small>
            </div>
          ) : (
            <div className={`hint ${hintOn ? '' : 'off'}`}>꽃이나 나무를 누르면 그날의 소리가 들려요 · 드래그로 둘러보기</div>
          )}

          <section ref={sheetRef} className={`home-sheet ${sheetOpen ? '' : 'closed'}`}>
            <div
              className="sheet-handle"
              onPointerDown={onHandleDown}
              onPointerMove={onHandleMove}
              onPointerUp={onHandleUp}
              onPointerCancel={onHandleUp}
              role="button"
              aria-label={sheetOpen ? '녹음 카드 접기' : '녹음 카드 펼치기'}
            >
              <div className="grip" />
            </div>
            <button
              className="status"
              onClick={sheetOpen ? status.onClick : () => setSheetOpen(true)}
              disabled={sheetOpen && !status.onClick}
            >
              <div className="avatars">
                <span className="av partner">{partner ? [...pName][0] : '?'}</span>
                <span className="av me">나</span>
              </div>
              <div className="status-text">
                <b>{status.title}</b>
                <small>{status.sub}</small>
              </div>
            </button>
            <button className="mini-rec" onClick={() => setRecording(true)} aria-label="오늘의 소리 녹음하기" tabIndex={sheetOpen ? -1 : 0}>
              <Mic />
            </button>
            <button className="record-cta" onClick={() => setRecording(true)}>
              <Mic /> 오늘의 소리 녹음하기 · 10초
            </button>
            <button className="comfort-btn" onClick={comfort}><Heart /> 오늘의 위로 · 받은 소리 하나 다시 듣기</button>
          </section>
        </>
      )}

      {tab === 'album' && <Album data={data} meId={meId} onOpen={setOpenFlower} onOpenPair={setOpenPair} flowerById={flowerById} />}
      {tab === 'friends' && <Friends data={data} partner={partner} />}
      {tab === 'me' && <Me me={me} data={data} email={email} onSignOut={onSignOut} />}

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
                    <div><b>{displayName(f)}</b><small>{formatDate(f.sent_date)} {timeOfDay(f.created_at)}</small></div>
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
            <b>{displayName(f)}</b>
            <small>{f.sender_id === meId ? '내가 보냄' : '받음'}</small>
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <div className="page">
      <h1 className="page-title">이번 주 소리 앨범</h1>
      {week.length === 0 && (
        <div className="card album-empty">
          <Flower flower={{ color: 'hsl(250 40% 80%)', petals: 5, vowel: 'Y', consonant: '평', rms: 0.04 }} size={64} stem={false} />
          <b>이번 주에는 아직 핀 꽃이 없어요</b>
          <small className="muted">소리를 보내거나 받으면 날짜별로 여기에 모여요</small>
        </div>
      )}
      {week.map((r) => <Day key={r.date} r={r} />)}
      {older.length > 0 && <h2 className="page-sub">지난 소리</h2>}
      {older.map((r) => <Day key={r.date} r={r} />)}
    </div>
  )
}

// 친구 목록: 한 사람당 정원은 하나, 정원 하나에 두 사람 → 친구는 내 정원을 함께 가꾸는 사람.
// 친구가 보낸 소리는 내 정원 왼쪽에, 내가 보낸 소리는 오른쪽에 꽃으로 핀다.
function Friends({ data, partner }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(data.garden.code); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch {}
  }
  const sentBy = (id) => data.flowers.filter((f) => f.sender_id === id).length
  const since = new Date(partner?.created_at || data.garden.created_at)

  return (
    <div className="page">
      <h1 className="page-title">친구</h1>
      {partner ? (
        <ul className="friend-list">
          <li className="card person">
            <span className="av partner big">{[...partner.nickname][0]}</span>
            <div>
              <b>{partner.nickname}</b>
              <small className="muted">{since.getMonth() + 1}월 {since.getDate()}일부터 함께 · 보낸 소리 {sentBy(partner.id)}송이 · 우리의 꽃 {data.pairs.length}송이</small>
            </div>
          </li>
        </ul>
      ) : (
        <>
          <p className="muted">아직 함께하는 친구가 없어요. 정원 코드를 알려 주면 친구가 들어와 소리를 보낼 수 있어요.</p>
          <div className="card invite">
            <div>
              <small className="muted">내 정원 코드</small>
              <div className="big-code">{data.garden.code}</div>
            </div>
            <button className="ghost" onClick={copy}>{copied ? '복사했어요' : '코드 복사'}</button>
          </div>
        </>
      )}
      <p className="small muted">친구가 보낸 소리는 정원 왼쪽, 내가 보낸 소리는 오른쪽에 꽃(말소리)이나 나무(그 밖의 소리)로 자라요. 같은 날 둘 다 보내면 가운데에 우리의 꽃이 피어요.</p>
    </div>
  )
}

function Me({ me, data, email, onSignOut }) {
  return (
    <div className="page">
      <h1 className="page-title">나</h1>
      <div className="card person">
        <span className="av me big">나</span>
        <div><b>{me?.nickname}</b><small className="muted">정원 코드 {data.garden.code}</small></div>
      </div>
      <div className="card account">
        <small className="muted">로그인한 계정</small>
        <b>{email}</b>
        <p className="small muted">다른 기기에서도 이 계정으로 로그인하면 이 정원이 열려요.</p>
      </div>
      <div className="card">
        <p className="small">녹음은 우리 두 사람만 들을 수 있어요. 내가 보낸 소리는 꽃이나 나무를 눌러 언제든 지울 수 있어요.</p>
      </div>
      <button className="ghost wide" onClick={onSignOut}>로그아웃</button>
    </div>
  )
}

function formatDate(d) {
  if (d === today()) return '오늘'
  const [, m, day] = d.split('-')
  return `${Number(m)}월 ${Number(day)}일`
}
