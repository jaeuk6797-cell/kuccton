import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Flower from './Flower.jsx'
import Island3D from './Island3D.jsx'
import Recorder from './Recorder.jsx'
import { FlowerDetail, PairDetail } from './Details.jsx'
import ShareSheet from './Share.jsx'
import Visit from './Visit.jsx'
import { displayName } from '../lib/tree.js'
import { Bell, ChevronUp, Heart, Menu, Mic, Sprout, User, Users, Wave } from './Icons.jsx'
import { addFriend, currentUser, deleteFlower, insertFlower, loadGarden, respondShare, setGardenPublic, shareFlowers, subscribeGarden, today, uploadAudio } from '../lib/db.js'

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

// demo: 개발용 미리보기(?view=home)에서만 넘긴다. 주면 Supabase 대신 그 데이터로 화면만 그린다.
export default function Garden({ session, onSignOut, email, demo }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('garden')
  const [recording, setRecording] = useState(false)
  const [openFlower, setOpenFlower] = useState(null)
  const [openPair, setOpenPair] = useState(null)
  const [showBell, setShowBell] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [viewFriend, setViewFriend] = useState('all') // 정원에서 볼 꽃: 'all' 또는 친구 member id // 오른쪽 위 메뉴: 정원·앨범·친구·나·받은 소리
  const [toast, setToast] = useState('')
  const [fresh, setFresh] = useState(() => new Set())
  const [highlight, setHighlight] = useState(null)
  const [sharePick, setSharePick] = useState(null) // { flower } 또는 { friend }
  const [visiting, setVisiting] = useState(null) // 놀러 간 친구
  // 플로팅 도구: 접어도 ^ 손잡이·상태 카드·작은 녹음 버튼은 남긴다.
  // = 손잡이 28 + 간격 10 + 상태 카드 64 + 아래 여백 8
  const SHEET_PEEK = 110
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
      // 플로팅 도구 아래 여백에는 기기 안전 영역과 정원 여백이 포함된다.
      const tabH = parseFloat(getComputedStyle(sheet).bottom) || 0
      const sheetH = sheet.offsetHeight
      const top = 120 // .island의 top과 같아야 한다
      const closedH = home.clientHeight - top - tabH - SHEET_PEEK + 8
      const openH = home.clientHeight - top - tabH - sheetH + 15
      home.style.setProperty('--sheet-h', `${sheetH}px`)
      home.style.setProperty('--sheet-peek', `${SHEET_PEEK}px`)
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
    if (demo) { setData(demo); return }
    try {
      setData(await loadGarden(session.gardenId))
    } catch (e) {
      console.error(e)
      setError(e.message || String(e))
    }
  }, [session.gardenId, demo])

  useEffect(() => {
    refresh()
    if (demo) return
    let unsub = () => {}, alive = true
    currentUser().then((u) => {
      if (!alive || !u) return
      unsub = subscribeGarden(session.gardenId, u.id, (kind, row) => {
        if (kind === 'share') showToast('새 소리가 도착했어요 · 받은 소리함에서 골라 주세요')
        if (kind === 'answered' && row.status === 'accepted') showToast('친구가 내 소리를 정원에 심었어요')
        if (kind === 'friend') showToast('친구 목록이 바뀌었어요')
        refresh()
      })
    })
    return () => { alive = false; unsub() }
  }, [session.gardenId, meId, refresh, demo])

  // 받은 소리함: 정원에 심기(받기) / 괜찮아요(거절)
  async function answer(item, accept) {
    try {
      await respondShare(item.share_id, accept)
      if (accept) markFresh(item.id)
      showToast(accept ? `${displayName(item)}을 정원에 심었어요` : '받지 않았어요')
      setOpenFlower(null)
      await refresh()
    } catch (e) {
      showToast(e.message || String(e))
    }
  }

  async function togglePublic(next) {
    try {
      await setGardenPublic(next)
      showToast(next ? '정원을 공개했어요. 친구들이 놀러 올 수 있어요' : '정원을 비공개로 바꿨어요')
      await refresh()
    } catch (e) {
      showToast(e.message || String(e))
    }
  }

  async function handleShare(flowerIds, userIds) {
    await shareFlowers(flowerIds, userIds)
    showToast('소리를 공유했어요')
    await refresh()
  }

  function markFresh(id) {
    setFresh((s) => new Set(s).add(id))
    setTimeout(() => setFresh((s) => { const n = new Set(s); n.delete(id); return n }), 5000)
  }
  function showToast(t) {
    setToast(t)
    setTimeout(() => setToast(''), 3500)
  }

  // 오늘의 소리 보내기: 소리 파일과 꽃은 내 쪽에 한 번 저장하고(공유의 원본), 고른 친구들에게만 공유한다.
  // 내 정원에는 내가 보낸 꽃이 피지 않는다 (받은 소리와 우리의 꽃만).
  async function handleSend(payload, toUserIds) {
    const { blob, ...fields } = payload
    if (!toUserIds?.length) throw new Error('받을 친구를 골라 주세요')
    const audio_path = await uploadAudio(session.gardenId, blob)
    const row = await insertFlower({ ...fields, audio_path, garden_id: session.gardenId, sender_id: meId, sent_date: today() })
    await shareFlowers([row.id], toUserIds)
    setRecording(false)
    setTab('garden')
    showToast(`${toUserIds.length}명에게 소리를 보냈어요`)
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
    const partner = data.friends[0] || null
    const t = today()
    const onDay = (iso) => iso && new Date(iso).toLocaleDateString('sv-SE') === t
    const todayShared = data.sentShares.find((x) => onDay(x.created_at))
    const todayRecv = [...data.receivedShares].reverse().find((x) => onDay(x.created_at))
    const todayTheirs = todayRecv && data.flowers.find((f) => f.id === todayRecv.flower_id)
    const todayPair = data.pairs.find((p) => p.sent_date === t)
    return { me, partner, todayShared, todayRecv, todayTheirs, todayPair }
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

  const { me, partner, todayShared, todayRecv, todayTheirs, todayPair } = derived
  const nameOf = (userId) => data.friends.find((x) => x.user_id === userId)?.nickname || '친구'
  const flowerById = Object.fromEntries(data.flowers.map((f) => [f.id, f]))

  let status
  if (data.friends.length === 0) status = { title: '아직 친구가 없어요', sub: '친구 코드로 친구를 맺으면 소리를 주고받을 수 있어요', onClick: () => setTab('friends') }
  else if (data.inbox.length) status = { title: `${josa(nameOf(data.inbox[data.inbox.length - 1].from_user), '이', '가')} 소리를 보냈어요`, sub: `받은 소리함에서 정원에 심을지 골라 주세요 · ${data.inbox.length}개`, onClick: () => setShowBell(true) }
  else if (todayPair) status = { title: `오늘 ‘${todayPair.name}’이 피었어요`, sub: '눌러서 두 소리를 함께 들어 보세요', onClick: () => setOpenPair(todayPair) }
  else if (todayTheirs) status = { title: `${josa(nameOf(todayRecv.from_user), '이', '가')} ${timeOfDay(todayRecv.created_at)} 소리를 보냈어요`, sub: '나도 오늘의 소리를 보내면 우리의 꽃이 피어요', onClick: () => setOpenFlower(todayTheirs) }
  else if (todayShared) status = { title: '오늘의 소리를 보냈어요', sub: `${nameOf(todayShared.to_user)}의 소리를 기다리고 있어요` }
  else status = { title: '오늘은 아직 조용해요', sub: '오늘의 소리를 친구에게 보내 보세요' }

  const receivedCount = data.flowers.filter((f) => f.sender_id !== meId).length
  // 친구별 보기: 친구가 몇 명이든 같은 방식 (지금 DB는 정원당 2명이라 친구는 1명)
  const friends = data.members.filter((m) => m.id !== meId)
  const sentCount = (id) => data.flowers.filter((f) => f.sender_id === id).length
  const viewing = friends.some((m) => m.id === viewFriend) ? viewFriend : 'all'
  // 내 정원에는 친구에게 받은 소리만 핀다 (내가 보낸 소리는 친구 정원에, 둘이 만나면 가운데 우리의 꽃)
  const gardenFlowers = data.flowers.filter((f) => f.sender_id !== meId)
  const shownFlowers = viewing === 'all' ? gardenFlowers : gardenFlowers.filter((f) => f.sender_id === viewing)
  const shownPairs = viewing === 'all' ? data.pairs : data.pairs.filter((p) =>
    flowerById[p.flower_a_id]?.sender_id === viewing || flowerById[p.flower_b_id]?.sender_id === viewing)
  const showFriend = (id) => { setViewFriend(id); setTab('garden') }
  const received = data.flowers.filter((f) => f.sender_id !== meId).slice(-8).reverse()

  // 손잡이를 끌면 카드·섬·안내 문구가 함께 손가락을 따라오고(--sheet-p: 0 열림 ~ 1 접힘),
  // 놓으면 가까운 쪽으로 부드럽게 붙는다. 빠르게 튕기면 짧게 끌어도 넘어간다. 살짝 누르면 토글
  const onHandleDown = (e) => {
    dragRef.current = { y: e.clientY, dy: 0, t: performance.now(), v: 0, h: Math.max(1, sheetRef.current.offsetHeight - SHEET_PEEK) }
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
  const onHandleCancel = () => {
    dragRef.current = null
    homeRef.current?.classList.remove('dragging')
    homeRef.current?.style.removeProperty('--sheet-p')
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
            flowers={shownFlowers}
            pairs={shownPairs}
            meId={meId}
            freshIds={fresh}
            highlightId={highlight}
            onPickFlower={setOpenFlower}
            onPickPair={setOpenPair}
          />
          </div>
          <div className="home-title">
            <span className="wordmark" aria-label="SUP 소리숲">SUP</span>
            <h1>{me?.nickname}의 정원</h1>
            {friends.length > 0 && (
              <div className="view-pills" role="tablist" aria-label="누구의 꽃을 볼까요">
                <button role="tab" aria-selected={viewing === 'all'} className={viewing === 'all' ? 'on' : ''} onClick={() => setViewFriend('all')}>
                  전체 <b>{receivedCount}</b>
                </button>
                {friends.map((m) => (
                  <button key={m.id} role="tab" aria-selected={viewing === m.id} className={viewing === m.id ? 'on' : ''} onClick={() => setViewFriend(m.id)}>
                    {m.nickname} <b>{sentCount(m.id)}</b>
                  </button>
                ))}
              </div>
            )}
          </div>
          {gardenFlowers.length === 0 && data.pairs.length === 0 ? (
            <div className="empty-garden">
              <b>아직 핀 꽃이 없어요</b>
              <small>친구가 소리를 보내면 여기에 꽃이 피어요</small>
            </div>
          ) : (
            <div className={`hint ${hintOn ? '' : 'off'}`}>꽃이나 나무를 누르면 그날의 소리가 들려요 · 드래그로 둘러보기</div>
          )}

          <section ref={sheetRef} className={`home-sheet ${sheetOpen ? '' : 'closed'}`} aria-label="정원 도구">
            <button
              type="button"
              className="sheet-handle"
              onPointerDown={onHandleDown}
              onPointerMove={onHandleMove}
              onPointerUp={onHandleUp}
              onPointerCancel={onHandleCancel}
              onClick={(e) => { if (e.detail === 0) setSheetOpen((o) => !o) }}
              aria-expanded={sheetOpen}
              aria-controls="garden-actions"
              aria-label={sheetOpen ? '정원 도구 접기' : '정원 도구 펼치기'}
            >
              <ChevronUp aria-hidden="true" />
            </button>
            <button
              className="status"
              onClick={sheetOpen ? status.onClick : () => setSheetOpen(true)}
              disabled={sheetOpen && !status.onClick}
            >
              <span className="avatars" aria-hidden="true">
                <span className="av partner">{partner ? [...partner.nickname][0] : '?'}</span>
                <span className="av me">나</span>
              </span>
              <span className="status-text">
                <b>{status.title}</b>
                <small>{status.sub}</small>
              </span>
            </button>
            <button className="mini-rec" onClick={() => setRecording(true)} aria-label="오늘의 소리 녹음하기" tabIndex={sheetOpen ? -1 : 0} aria-hidden={sheetOpen}>
              <Mic />
            </button>
            <div id="garden-actions" className="garden-actions" inert={sheetOpen ? undefined : ''} aria-hidden={!sheetOpen}>
              <button className="comfort-btn" onClick={comfort}><Heart /> 오늘의 위로</button>
              <button className="record-cta" onClick={() => setRecording(true)} aria-label="오늘의 소리 녹음하기 · 최대 10초">
                <Mic /> 오늘의 소리 녹음 <small>10초</small>
              </button>
            </div>
          </section>
        </>
      )}

      {tab === 'album' && <Album data={data} meId={meId} onOpen={setOpenFlower} onOpenPair={setOpenPair} flowerById={flowerById} />}
      {tab === 'friends' && <Friends data={data} meId={meId} onAdded={refresh} onOpen={setOpenFlower} onShowInGarden={showFriend} onShareTo={(friend) => setSharePick({ friend })} onVisit={setVisiting} />}
      {tab === 'me' && <Me me={me} data={data} email={email} onSignOut={onSignOut} onTogglePublic={togglePublic} />}

      {/* 오른쪽 위 메뉴 (아래 탭바 대신). 어느 화면에서나 같은 자리에 있다 */}
      <button className="round-btn menu-btn" onClick={() => setMenuOpen((o) => !o)} aria-label="메뉴" aria-expanded={menuOpen}>
        <Menu />
        {data.inbox.length > 0 && <i className="badge" />}
      </button>
      {menuOpen && (
        <>
          <div className="menu-backdrop" onClick={() => setMenuOpen(false)} />
          <nav className="menu" aria-label="메뉴">
            {[
              ['garden', Sprout, '정원'],
              ['album', Wave, '앨범'],
              ['friends', Users, '친구'],
              ['me', User, '나'],
            ].map(([id, Icon, label]) => (
              <button key={id} className={tab === id ? 'on' : ''} onClick={() => { setTab(id); setMenuOpen(false) }}>
                <Icon /> <span>{label}</span>
              </button>
            ))}
            <hr />
            <button onClick={() => { setShowBell(true); setMenuOpen(false) }}>
              <Bell /> <span>받은 소리함{data.inbox.length > 0 ? ` ${data.inbox.length}` : ''}</span>
              {data.inbox.length > 0 && <i className="dot-new" />}
            </button>
          </nav>
        </>
      )}

      {toast && <div className="toast">{toast}</div>}
      {recording && <Recorder onClose={() => setRecording(false)} onSend={handleSend} friends={data.friends} />}
      {openFlower && (
        <FlowerDetail
          flower={openFlower}
          sender={data.members.find((m) => m.id === openFlower.sender_id)}
          mine={openFlower.sender_id === meId}
          sharedWith={data.sentShares.filter((x) => x.flower_id === openFlower.id).map((x) => `${nameOf(x.to_user)}${x.status === 'pending' ? '(고르는 중)' : x.status === 'declined' ? '(안 받음)' : ''}`)}
          onShare={() => setSharePick({ flower: openFlower })}
          onAccept={openFlower.share_id ? () => answer(openFlower, true) : undefined}
          onDecline={openFlower.share_id ? () => answer(openFlower, false) : undefined}
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
      {sharePick && (
        <ShareSheet
          flower={sharePick.flower}
          friend={sharePick.friend}
          friends={data.friends}
          myFlowers={data.flowers.filter((f) => f.sender_id === meId)}
          sentShares={data.sentShares}
          onSubmit={handleShare}
          onClose={() => setSharePick(null)}
        />
      )}
      {showBell && (
        <div className="sheet-backdrop" onClick={() => setShowBell(false)}>
          <div className="sheet inbox" onClick={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setShowBell(false)} aria-label="닫기">×</button>
            <h2 className="sheet-title">받은 소리함</h2>
            {data.inbox.length === 0 ? (
              <p className="muted">새로 도착한 소리가 없어요.</p>
            ) : (
              <>
                <p className="muted small">들어 보고 정원에 심을지 골라 주세요. 심은 소리만 정원에 자라요.</p>
                <ul className="list inbox-list">
                  {[...data.inbox].reverse().map((f) => (
                    <li key={f.share_id}>
                      <button className="inbox-item" onClick={() => { setShowBell(false); setOpenFlower(f) }}>
                        <Flower flower={f} size={40} stem={false} bloom={false} />
                        <div><b>{displayName(f)}</b><small>{nameOf(f.from_user)} · {timeOfDay(f.shared_at)} · 눌러서 듣기</small></div>
                      </button>
                      <div className="inbox-actions">
                        <button className="primary small-btn" onClick={() => answer(f, true)}>심기</button>
                        <button className="ghost small-btn" onClick={() => answer(f, false)}>괜찮아요</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {received.length > 0 && (
              <>
                <h3 className="page-sub">정원에 심은 소리</h3>
                <ul className="list">
                  {received.map((f) => (
                    <li key={f.id}>
                      <button onClick={() => { setShowBell(false); setOpenFlower(f) }}>
                        <Flower flower={f} size={40} stem={false} bloom={false} />
                        <div><b>{displayName(f)}</b><small>{data.members.find((m) => m.id === f.sender_id)?.nickname || '친구'} · {formatDate(f.sent_date)}</small></div>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}
      {visiting && <Visit friend={visiting} onClose={() => setVisiting(null)} />}
    </div>
  )
}

function Album({ data, meId, onOpen, onOpenPair, flowerById }) {
  const rows = useMemo(() => {
    const byDate = {}
    // 앨범에는 친구에게 받은 소리만 (내가 보낸 소리는 친구 정원에 있다). 우리의 꽃은 함께 둔다
    for (const f of data.flowers.filter((x) => x.sender_id !== meId)) (byDate[f.sent_date] ||= { date: f.sent_date, list: [], pairs: [] }).list.push(f)
    for (const p of data.pairs) (byDate[p.sent_date] ||= { date: p.sent_date, list: [], pairs: [] }).pairs.push(p)
    return Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date))
  }, [data, meId])
  const weekAgo = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)
  const week = rows.filter((r) => r.date >= weekAgo)
  const older = rows.filter((r) => r.date < weekAgo)

  const Day = ({ r }) => (
    <div className="album-day">
      <div className="album-date">{formatDate(r.date)}</div>
      <div className="album-flowers">
        {r.pairs.filter((p) => flowerById[p.flower_a_id] && flowerById[p.flower_b_id]).map((p) => (
          <button key={p.id} className="album-item pair" onClick={() => onOpenPair(p)}>
            <Flower flower={flowerById[p.flower_b_id]} colors={[flowerById[p.flower_a_id].color, flowerById[p.flower_b_id].color]} size={52} stem={false} />
            <b>{p.name}</b><small>우리의 꽃</small>
          </button>
        ))}
        {r.list.map((f) => (
          <button key={f.id} className="album-item" onClick={() => onOpen(f)}>
            <Flower flower={f} size={46} stem={false} />
            <b>{displayName(f)}</b>
            <small>{`${data.members.find((m) => m.id === f.sender_id)?.nickname || '친구'}에게 받음`}</small>
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
          <small className="muted">친구에게 받은 소리가 날짜별로 여기에 모여요</small>
        </div>
      )}
      {week.map((r) => <Day key={r.date} r={r} />)}
      {older.length > 0 && <h2 className="page-sub">지난 소리</h2>}
      {older.map((r) => <Day key={r.date} r={r} />)}
    </div>
  )
}

// 친구: 친구 코드(= 정원 코드)로 친구를 맺고, 친구마다 내 소리를 골라 공유한다.
// 친구가 공유한 소리는 내 정원 왼쪽에, 내 소리는 오른쪽에 핀다.
function Friends({ data, meId, onAdded, onOpen, onShowInGarden, onShareTo, onVisit }) {
  const [copied, setCopied] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const myCode = data.garden.code

  const shareCode = async () => {
    const text = `소리숲에서 소리를 주고받아요! 내 친구 코드: ${myCode}
https://kuccton.vercel.app`
    try {
      if (navigator.share) { await navigator.share({ title: '소리숲 친구 코드', text }); return }
    } catch { return } // 공유 창을 닫은 경우
    try { await navigator.clipboard.writeText(myCode); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch {}
  }

  async function add() {
    setBusy(true); setError(''); setNotice('')
    try {
      const r = await addFriend(code)
      setNotice(`${josa(r.nickname, '과', '와')} 친구가 되었어요`)
      setCode('')
      await onAdded()
    } catch (e) {
      setError(e.message || String(e))
    } finally { setBusy(false) }
  }

  const mineCount = (userId) => data.sentShares.filter((x) => x.to_user === userId).length

  return (
    <div className="page">
      <h1 className="page-title">친구</h1>

      <div className="card invite">
        <div>
          <small className="muted">내 친구 코드</small>
          <div className="big-code">{myCode}</div>
        </div>
        <button className="ghost" onClick={shareCode}>{copied ? '복사했어요' : '코드 보내기'}</button>
      </div>

      <div className="card join-friend">
        <b>친구 맺기</b>
        <input
          value={code}
          inputMode="numeric"
          maxLength={6}
          onChange={(e) => { setCode(e.target.value.replace(/\D/g, '')); setError(''); setNotice('') }}
          placeholder="친구에게 받은 코드 6자리"
          className="code-input"
        />
        <button className="primary" disabled={busy || code.length !== 6} onClick={add}>{busy ? '맺는 중…' : '친구 맺기'}</button>
        {notice && <p className="small notice">{notice}</p>}
        {error && <p className="error">{error}</p>}
      </div>

      {data.friends.length === 0 ? (
        <p className="muted">아직 친구가 없어요. 내 코드를 보내거나 친구의 코드를 넣어 주세요.</p>
      ) : (
        <ul className="friend-list">
          {data.friends.map((fr) => {
            const theirs = data.flowers.filter((f) => f.sender_id === fr.member_id).slice().reverse()
            const since = new Date(fr.since)
            return (
              <li key={fr.user_id} className="card friend-card">
                <div className="person">
                  <span className="av partner big">{[...fr.nickname][0]}</span>
                  <div>
                    <b>{fr.nickname}</b>
                    <small className="muted">{since.getMonth() + 1}월 {since.getDate()}일부터 친구 · 받은 소리 {theirs.length}개 · 공유한 소리 {mineCount(fr.user_id)}개</small>
                  </div>
                </div>
                <div className="friend-actions">
                  <button className="primary small-btn" onClick={() => onShareTo(fr)}>소리 공유하기</button>
                  {fr.is_public ? (
                    <button className="ghost small-btn" onClick={() => onVisit(fr)}>정원 놀러 가기</button>
                  ) : (
                    <span className="small muted">🔒 비공개 정원</span>
                  )}
                </div>
                {theirs.length === 0 ? (
                  <p className="small muted">아직 {fr.nickname}에게 받은 소리가 없어요.</p>
                ) : (
                  <>
                    <ul className="sent-list">
                      {theirs.slice(0, 6).map((f) => (
                        <li key={f.id}>
                          <button onClick={() => onOpen(f)}>
                            <Flower flower={f} size={34} stem={false} bloom={false} />
                            <span>{displayName(f)}</span>
                            <small>{formatDate(f.sent_date)}</small>
                          </button>
                        </li>
                      ))}
                    </ul>
                    {theirs.length > 6 && <p className="small muted">외 {theirs.length - 6}개</p>}
                    <button className="ghost small-btn" onClick={() => onShowInGarden(fr.member_id)}>정원에서 {fr.nickname}의 소리만 보기</button>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <p className="small muted">친구가 보낸 소리는 받은 소리함에 도착하고, 심은 소리만 내 정원에 꽃(말소리)이나 나무(그 밖의 소리)로 자라요. 내가 보낸 소리는 친구 정원에 피어요. 같은 날 서로 보낸 소리를 둘 다 심으면 가운데에 우리의 꽃이 피어요. 친구가 정원을 공개하면 놀러 갈 수 있어요.</p>
    </div>
  )
}

function Me({ me, data, email, onSignOut, onTogglePublic }) {
  return (
    <div className="page">
      <h1 className="page-title">나</h1>
      <div className="card person">
        <span className="av me big">나</span>
        <div><b>{me?.nickname}</b><small className="muted">정원 코드 {data.garden.code}</small></div>
      </div>
      <label className="card switch-row">
        <div>
          <b>정원 공개</b>
          <small className="muted">{data.garden.is_public
            ? '친구들이 내 정원에 놀러 와서 내가 심은 소리를 들을 수 있어요.'
            : '지금은 비공개예요. 공개해도 친구에게 받은 소리는 보이지 않아요. 비공개여도 소리 공유는 그대로 돼요.'}</small>
        </div>
        <input type="checkbox" className="switch" checked={Boolean(data.garden.is_public)} onChange={(e) => onTogglePublic(e.target.checked)} />
      </label>
      <div className="card account">
        <small className="muted">로그인한 계정</small>
        <b>{email}</b>
        <p className="small muted">다른 기기에서도 이 계정으로 로그인하면 이 정원이 열려요.</p>
      </div>
      <div className="card">
        <p className="small">녹음은 내가 공유한 친구만 들을 수 있어요. 내 소리는 꽃이나 나무를 눌러 언제든 지울 수 있어요.</p>
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
