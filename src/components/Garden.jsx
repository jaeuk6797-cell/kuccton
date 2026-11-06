import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Flower from './Flower.jsx'
import Island3D from './Island3D.jsx'
import Recorder from './Recorder.jsx'
import { FlowerDetail, PairDetail } from './Details.jsx'
import ShareSheet from './Share.jsx'
import Visit from './Visit.jsx'
import Avatar from './Avatar.jsx'
import Tutorial, { HelpPage } from './Tutorial.jsx'
import { displayName } from '../lib/tree.js'
import { Bell, ChevronUp, Heart, Help, Menu, Mic, Pencil, Sprout, User, Users, Wave } from './Icons.jsx'
import { GARDEN_LIMIT, GARDEN_NEAR_FULL, addFriend, archiveShares, audioUrl, currentUser, deleteFlower, derivePairs, insertFlower, loadGarden, respondShare, shareFlowers, subscribeGarden, today, updateProfile, uploadAudio } from '../lib/db.js'
import { receivedSoundCollections } from '../lib/receivedSounds.js'

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
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const tutorialPromptedRef = useRef(false)
  const [cleanupOpen, setCleanupOpen] = useState(false) // 정원 정리하기 창
  const [friendPicker, setFriendPicker] = useState(false) // '+N' 친구 고르기 창
  const menuButtonRef = useRef(null)
  const inboxBackRef = useRef(null)
  const inboxMenuRef = useRef(null)
  useEffect(() => {
    if (!menuOpen) return
    if (showBell) inboxBackRef.current?.focus()
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeMenu()
        menuButtonRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [menuOpen, showBell])
  const [viewFriend, setViewFriend] = useState('all') // 정원에서 볼 꽃: 'all' 또는 친구 member id // 오른쪽 위 메뉴: 정원·앨범·친구·나·받은 소리
  const [toast, setToast] = useState('')
  const [answerBusy, setAnswerBusy] = useState(false)
  const answeringRef = useRef(false)
  const [gardenViewReset, setGardenViewReset] = useState(0)
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
        if (kind === 'message') showToast(`💬 새 메시지: ${String(row.body).slice(0, 30)}`)
        if (kind === 'answered' && row.status === 'accepted') showToast('친구가 내 소리를 정원에 심었어요')
        if (kind === 'friend') showToast('친구 목록이 바뀌었어요')
        refresh()
      })
    })
    return () => { alive = false; unsub() }
  }, [session.gardenId, meId, refresh, demo])

  // 계정별로 이 기기에서 처음 정원에 들어오면 안내한다. 도움말에서 언제든 다시 볼 수 있다.
  useEffect(() => {
    if (!data || tutorialPromptedRef.current) return
    tutorialPromptedRef.current = true
    if (demo) {
      if (new URLSearchParams(location.search).get('tutorial') === '1') setTutorialOpen(true)
      return
    }
    // 튜토리얼은 정원을 처음 만든 직후에만 (다른 기기에서 로그인하거나 다시 열 때는 띄우지 않는다)
    if (session.justCreated) setTutorialOpen(true)
  }, [data, demo, meId, session.justCreated])

  function finishTutorial(completed) {
    setTutorialOpen(false)
    if (completed) setTab('garden')
  }

  // 나 탭: 닉네임·프로필 사진 바꾸기. photo: File | 'remove' | null
  async function saveProfile(nickname, photo) {
    if (demo) {
      setData((d) => ({ ...d, members: d.members.map((m) => (m.id === meId ? { ...m, nickname, avatar_url: photo === 'remove' ? null : photo ? URL.createObjectURL(photo) : m.avatar_url } : m)) }))
    } else {
      await updateProfile(nickname, photo)
      await refresh()
    }
    showToast('프로필을 바꿨어요')
  }

  function updateDemoReceived(shareIds, status) {
    setData((d) => {
      const collections = receivedSoundCollections(d.receivedHistory.map((f) => shareIds.includes(f.share_id)
        ? { ...f, share_status: status } : f))
      const { receivedFlowers, ...received } = collections
      const flowers = [...d.flowers.filter((f) => f.sender_id === meId), ...receivedFlowers]
      const byId = Object.fromEntries(flowers.map((f) => [f.id, f]))
      return { ...d, ...received, flowers, pairs: derivePairs(d.friends, d.sentShares.filter((s) => s.status === 'accepted'), received.receivedShares, byId) }
    })
  }

  // 받은 소리함: 정원에 심기(받기) / 괜찮아요(거절)
  async function answer(item, accept) {
    // 정원이 가득 찼으면 심기 전에 스스로 정리하게 한다 (DB에서도 막는다)
    const planted = data.flowers.filter((f) => f.sender_id !== meId).length
    if (accept && planted >= GARDEN_LIMIT) {
      showToast(`정원이 가득 찼어요(${GARDEN_LIMIT}송이) · 정리한 뒤에 심어 주세요`)
      setOpenFlower(null); closeMenu(); setCleanupOpen(true)
      return
    }
    if (answeringRef.current) return
    answeringRef.current = true
    setAnswerBusy(true)
    try {
      if (demo) {
        updateDemoReceived([item.share_id], accept ? 'accepted' : 'declined')
      } else {
        await respondShare(item.share_id, accept)
        await refresh()
      }
      if (accept) markFresh(item.id)
      const after = planted + 1
      showToast(!accept ? '받지 않았어요'
        : after >= GARDEN_LIMIT ? `정원이 가득 찼어요(${after}/${GARDEN_LIMIT}) · 정리해야 새 소리를 심을 수 있어요`
        : after >= GARDEN_NEAR_FULL ? `정원이 거의 찼어요(${after}/${GARDEN_LIMIT}) · 정리해 두면 좋아요`
        : `${josa(displayName(item), '을', '를')} 정원에 심었어요`)
      setOpenFlower(null)
    } catch (e) {
      showToast(e.message || String(e))
    } finally {
      answeringRef.current = false
      setAnswerBusy(false)
    }
  }

  // 정원 정리: 고른 소리를 정원에서 뺀다 (앨범에는 남는다)
  async function cleanup(shareIds) {
    try {
      const n = demo ? shareIds.length : await archiveShares(shareIds)
      if (demo) updateDemoReceived(shareIds, 'archived')
      showToast(`${n}송이를 정원에서 뺐어요 · 앨범에는 남아 있어요`)
      setCleanupOpen(false); setOpenFlower(null)
      if (!demo) await refresh()
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
  function openInbox() { setShowBell(true); setMenuOpen(true) }
  function closeMenu() { setMenuOpen(false); setShowBell(false) }

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
    showToast(`${toUserIds.length}명에게 공유했어요 · 친구가 받으면 친구 정원에 피어요`)
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

  // who: 상태 카드 아바타에 보여 줄 친구 (소식의 주인공). 친구가 여러 명이어도 맞는 사람이 보이게
  const todaySentTo = [...new Set(data.sentShares.filter((x) => new Date(x.created_at).toLocaleDateString('sv-SE') === today()).map((x) => x.to_user))]
  let status
  if (data.friends.length === 0) status = { title: '아직 친구가 없어요', sub: '나 탭에서 친구 코드로 친구를 맺으면 소리를 주고받을 수 있어요', onClick: () => setTab('me') }
  else if (data.inbox.length) {
    const last = data.inbox[data.inbox.length - 1]
    const senders = new Set(data.inbox.map((x) => x.from_user)).size
    status = { who: nameOf(last.from_user), whoId: last.from_user, title: senders > 1 ? `친구 ${senders}명이 소리를 보냈어요` : `${josa(nameOf(last.from_user), '이', '가')} 소리를 보냈어요`, sub: `받은 소리함에서 정원에 심을지 골라 주세요 · ${data.inbox.length}개`, onClick: openInbox }
  }
  else if (todayPair) status = { who: nameOf(todayPair.friend), whoId: todayPair.friend, title: `오늘 ‘${todayPair.name}’이 피었어요`, sub: '눌러서 두 소리를 함께 들어 보세요', onClick: () => setOpenPair(todayPair) }
  else if (todayTheirs) status = { who: nameOf(todayRecv.from_user), whoId: todayRecv.from_user, title: `${josa(nameOf(todayRecv.from_user), '이', '가')} ${timeOfDay(todayRecv.created_at)} 소리를 보냈어요`, sub: '나도 오늘의 소리를 보내면 우리의 꽃이 피어요', onClick: () => setOpenFlower(todayTheirs) }
  else if (todayShared) status = { who: nameOf(todayShared.to_user), whoId: todayShared.to_user, title: todaySentTo.length > 1 ? `오늘의 소리를 ${todaySentTo.length}명에게 보냈어요` : '오늘의 소리를 보냈어요', sub: todaySentTo.length > 1 ? '친구들이 소리를 보내면 우리의 꽃이 피어요' : `${nameOf(todayShared.to_user)}의 소리를 기다리고 있어요` }
  else status = { title: '오늘은 아직 조용해요', sub: '오늘의 소리를 친구에게 보내 보세요' }

  const receivedCount = data.flowers.filter((f) => f.sender_id !== meId).length
  // 친구별 보기: 친구가 몇 명이든 같은 방식 (지금 DB는 정원당 2명이라 친구는 1명)
  const friends = data.members.filter((m) => m.id !== meId)
  const sentCount = (id) => data.flowers.filter((f) => f.sender_id === id).length
  const viewing = friends.some((m) => m.id === viewFriend) ? viewFriend : 'all'
  // 최근에 소리를 주고받은 친구 순 (받은 소리의 공유 시각, 내가 보낸 공유 시각 중 늦은 것)
  const lastTouch = (m) => {
    const got = data.flowers.filter((f) => f.sender_id === m.id).map((f) => f.shared_at || f.created_at)
    const gave = data.sentShares.filter((x) => x.to_user === m.user_id).map((x) => x.created_at)
    return [...got, ...gave].sort().pop() || m.created_at || ''
  }
  const byRecent = [...friends].sort((a, b) => lastTouch(b).localeCompare(lastTouch(a)))
  const PILL_FRIENDS = 3
  const pillFriends = byRecent.slice(0, PILL_FRIENDS)
  const pickedFriend = friends.find((m) => m.id === viewing)
  if (pickedFriend && !pillFriends.includes(pickedFriend)) pillFriends.push(pickedFriend)
  const moreCount = friends.length - pillFriends.length
  // 내 정원에는 친구에게 받은 소리만 핀다 (내가 보낸 소리는 친구 정원에, 둘이 만나면 가운데 우리의 꽃)
  const gardenFlowers = data.flowers.filter((f) => f.sender_id !== meId)
  const shownFlowers = viewing === 'all' ? gardenFlowers : gardenFlowers.filter((f) => f.sender_id === viewing)
  const shownPairs = viewing === 'all' ? data.pairs : data.pairs.filter((p) =>
    flowerById[p.flower_a_id]?.sender_id === viewing || flowerById[p.flower_b_id]?.sender_id === viewing)
  // 친구별 보기: 섬에 보일 꽃 id (전체면 null → 모두). 문자열이라 값이 같으면 섬을 다시 만들지 않는다
  const visibleKey = viewing === 'all' ? null : [...shownFlowers.map((f) => f.id), ...shownPairs.map((p) => p.id)].join(',')

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
          <div className="island-touch">
          <Island3D
            resetViewKey={gardenViewReset}
            flowers={gardenFlowers}
            pairs={data.pairs}
            visibleIds={visibleKey}
            meId={meId}
            freshIds={fresh}
            highlightId={highlight}
            onPickFlower={setOpenFlower}
            onPickPair={setOpenPair}
          />
          </div>
          <div className="home-title">
            <span className="wordmark" aria-label="SUP">SUP</span>
            <h1><button className="garden-view-reset" onClick={() => setGardenViewReset((n) => n + 1)} aria-label={`${me?.nickname}의 정원 시점 초기화`}>{me?.nickname}의 정원</button></h1>
            {gardenFlowers.length >= GARDEN_NEAR_FULL && (
              <button className={`capacity-banner ${gardenFlowers.length >= GARDEN_LIMIT ? 'full' : ''}`} onClick={() => setCleanupOpen(true)}>
                {gardenFlowers.length >= GARDEN_LIMIT ? '정원이 가득 찼어요' : '정원이 거의 찼어요'} · {gardenFlowers.length}/{GARDEN_LIMIT} · <b>정리하기</b>
              </button>
            )}
            {friends.length > 0 && (
              <div className="view-pills" role="tablist" aria-label="누구의 꽃을 볼까요">
                <button role="tab" aria-selected={viewing === 'all'} className={viewing === 'all' ? 'on' : ''} onClick={() => setViewFriend('all')}>
                  전체 <b>{receivedCount}</b>
                </button>
                {pillFriends.map((m) => (
                  <button key={m.id} role="tab" aria-selected={viewing === m.id} className={viewing === m.id ? 'on' : ''} onClick={() => setViewFriend(viewing === m.id ? 'all' : m.id)}>
                    {m.nickname} <b>{sentCount(m.id)}</b>
                  </button>
                ))}
                {moreCount > 0 && (
                  <button className="more-pill" onClick={() => setFriendPicker(true)} aria-label={`친구 ${moreCount}명 더 보기`}>＋{moreCount}</button>
                )}
              </div>
            )}
          </div>
          {gardenFlowers.length === 0 && data.pairs.length === 0 ? (
            <div className="empty-garden">
              <b>아직 핀 꽃이 없어요</b>
              <small>친구가 소리를 보내면 여기에 꽃이 피어요</small>
            </div>
          ) : null}

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
                <Avatar name={status.who || partner?.nickname} url={(status.whoId ? data.friends.find((x) => x.user_id === status.whoId) : partner)?.avatar_url} />
                <Avatar me url={me?.avatar_url} />
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
      {tab === 'friends' && <Friends data={data} onOpen={setOpenFlower} onVisit={setVisiting} onGoMe={() => setTab('me')} />}
      {tab === 'me' && <Me me={me} email={email} onSignOut={onSignOut} code={data.garden.code} onAdded={refresh} onSaveProfile={saveProfile} />}
      {tab === 'help' && <HelpPage onTutorial={() => setTutorialOpen(true)} />}

      {/* 오른쪽 위 메뉴 (아래 탭바 대신). 어느 화면에서나 같은 자리에 있다 */}
      <button ref={menuButtonRef} className="round-btn menu-btn" onClick={() => menuOpen ? closeMenu() : setMenuOpen(true)} aria-label="메뉴" aria-expanded={menuOpen} aria-controls="garden-menu">
        <Menu />
        {data.inbox.length > 0 && <i className="badge" />}
      </button>
      {menuOpen && (
        <>
          <div className="menu-backdrop" onClick={closeMenu} />
          <div id="garden-menu" className={`menu${showBell ? ' menu-expanded' : ''}`}>
          {showBell ? (
            <section className="menu-inbox" aria-labelledby="inbox-heading">
              <header className="menu-inbox-header">
                <button ref={inboxBackRef} className="inbox-back" onClick={() => { setShowBell(false); requestAnimationFrame(() => inboxMenuRef.current?.focus()) }} aria-label="메뉴로 돌아가기">←</button>
                <h2 id="inbox-heading">받은 소리함</h2>
                <span className="inbox-count" aria-live="polite">{data.inbox.length}</span>
              </header>
              <InboxList items={data.inbox} nameOf={nameOf} onAnswer={answer} busy={answerBusy} />
            </section>
          ) : (
          <nav className="menu-nav" aria-label="메뉴">
            {[
              ['garden', Sprout, '정원'],
              ['album', Wave, '앨범'],
              ['friends', Users, '친구'],
              ['me', User, '나'],
            ].map(([id, Icon, label]) => (
              <button key={id} className={tab === id ? 'on' : ''} onClick={() => { setTab(id); closeMenu() }}>
                <Icon /> <span>{label}</span>
              </button>
            ))}
            <hr />
            <button ref={inboxMenuRef} onClick={openInbox}>
              <Bell /> <span>받은 소리함{data.inbox.length > 0 ? ` ${data.inbox.length}` : ''}</span>
              {data.inbox.length > 0 && <i className="dot-new" />}
            </button>
            <button className={tab === 'help' ? 'on' : ''} onClick={() => { setTab('help'); closeMenu() }}>
              <Help /> <span>도움말</span>
            </button>
          </nav>
          )}
          </div>
        </>
      )}

      {tutorialOpen && <Tutorial onDone={finishTutorial} />}
      {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
      {recording && <Recorder onClose={() => setRecording(false)} onSend={handleSend} friends={data.friends} />}
      {openFlower && (
        <FlowerDetail
          flower={openFlower}
          sender={data.members.find((m) => m.id === openFlower.sender_id)}
          mine={openFlower.sender_id === meId}
          sharedWith={data.sentShares.filter((x) => x.flower_id === openFlower.id).map((x) => `${nameOf(x.to_user)}${x.status === 'pending' ? '(고르는 중)' : x.status === 'declined' ? '(안 받음)' : ''}`)}
          onShare={tab === 'friends' ? undefined : () => setSharePick({ flower: openFlower })}
          onAccept={openFlower.share_id && openFlower.share_status !== 'accepted' ? () => answer(openFlower, true) : undefined}
          onDecline={openFlower.share_id && openFlower.share_status === 'pending' ? () => answer(openFlower, false) : undefined}
          answerBusy={answerBusy}
          onArchive={openFlower.planted_share_id ? () => cleanup([openFlower.planted_share_id]) : undefined}
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
      {cleanupOpen && (
        <Cleanup flowers={gardenFlowers} members={data.members} onSubmit={cleanup} onClose={() => setCleanupOpen(false)} />
      )}
      {friendPicker && (
        <FriendPicker
          friends={byRecent}
          counts={Object.fromEntries(friends.map((m) => [m.id, sentCount(m.id)]))}
          viewing={viewing}
          onPick={(id) => { setViewFriend(id); setFriendPicker(false) }}
          onClose={() => setFriendPicker(false)}
        />
      )}
      {visiting && <Visit friend={visiting} onClose={() => setVisiting(null)} />}
    </div>
  )
}

// 메뉴 안에서 목록과 재생기를 함께 보여 준다.
function InboxList({ items, nameOf, onAnswer, busy }) {
  const [playingId, setPlayingId] = useState(null)
  return (
    <div className="menu-inbox-body">
      {items.length === 0 ? (
        <div className="inbox-empty"><Bell /><p>새로 도착한 소리가 없어요.</p></div>
      ) : (
        <ul className="menu-inbox-list">
          {[...items].reverse().map((f) => (
            <li key={f.share_id}>
              <button className="menu-inbox-item" onClick={() => setPlayingId((id) => id === f.share_id ? null : f.share_id)} aria-label={`${displayName(f)} 듣기`} aria-expanded={playingId === f.share_id} aria-controls={`inbox-audio-${f.share_id}`}>
                <Flower flower={f} size={40} stem={false} bloom={false} />
                <span><b>{displayName(f)}</b><small>{nameOf(f.from_user)} · {timeOfDay(f.shared_at)}</small></span>
              </button>
              {playingId === f.share_id && <div id={`inbox-audio-${f.share_id}`}><InboxAudio flower={f} /></div>}
              <div className="inbox-actions">
                <button className="ghost small-btn" disabled={busy} onClick={() => onAnswer(f, false)}>괜찮아요</button>
                <button className="primary small-btn" disabled={busy} onClick={() => onAnswer(f, true)}>심기</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function InboxAudio({ flower }) {
  const [url, setUrl] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    setUrl(null); setError('')
    if (!flower.audio_path) { setError('재생할 소리가 없어요.'); return }
    audioUrl(flower.audio_path).then((u) => { if (active) setUrl(u) })
      .catch(() => { if (active) setError('소리를 불러오지 못했어요. 다시 눌러 주세요.') })
    return () => { active = false }
  }, [flower.audio_path])
  return error ? <p className="small muted" role="status">{error}</p>
    : url ? <audio src={url} controls autoPlay className="preview-audio" aria-label={`${displayName(flower)} 듣기`} onError={() => setError('소리를 재생하지 못했어요. 다시 눌러 주세요.')} />
      : <p className="small muted" role="status">소리를 불러오는 중…</p>
}

// '+N': 친구가 많을 때 이름으로 찾아서 그 친구 꽃만 또렷하게 보기
function FriendPicker({ friends, counts, viewing, onPick, onClose }) {
  const [q, setQ] = useState('')
  const shown = friends.filter((m) => m.nickname.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet friend-picker" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="닫기">×</button>
        <h2 className="sheet-title">누구의 꽃을 볼까요?</h2>
        <input className="picker-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="친구 이름 찾기" autoFocus />
        <ul className="list">
          <li><button className={viewing === 'all' ? 'on' : ''} onClick={() => onPick('all')}><b>전체</b><small>모든 친구의 꽃</small></button></li>
          {shown.map((m) => (
            <li key={m.id}>
              <button className={viewing === m.id ? 'on' : ''} onClick={() => onPick(m.id)}>
                <span className="av partner">{[...m.nickname][0]}</span>
                <div><b>{m.nickname}</b><small>받은 소리 {counts[m.id] || 0}개</small></div>
              </button>
            </li>
          ))}
          {shown.length === 0 && <li className="muted small">‘{q}’ 친구가 없어요</li>}
        </ul>
      </div>
    </div>
  )
}

// 정원 정리하기: 오래된 소리부터 보여 주고, 여러 개 골라 정원에서 뺀다
function Cleanup({ flowers, members, onSubmit, onClose }) {
  const [picked, setPicked] = useState(() => new Set())
  const [busy, setBusy] = useState(false)
  const list = [...flowers].sort((a, b) => String(a.shared_at || a.created_at).localeCompare(String(b.shared_at || b.created_at)))
  const toggle = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const full = flowers.length >= GARDEN_LIMIT
  async function submit() {
    setBusy(true)
    try { await onSubmit([...picked]) } finally { setBusy(false) }
  }
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet share-sheet cleanup" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="닫기">×</button>
        <h2 className="sheet-title">정원 정리하기</h2>
        <p className={`small ${full ? 'error' : 'muted'}`}>
          지금 {flowers.length}/{GARDEN_LIMIT}송이{full ? ' · 가득 차서 새 소리를 심을 수 없어요' : ''}. 정원에서 뺀 소리는 지워지지 않고 앨범에 남아요.
        </p>
        <button className="link select-all" onClick={() => setPicked(new Set(list.slice(0, 10).map((f) => f.planted_share_id)))}>오래된 10송이 고르기</button>
        <ul className="pick-grid">
          {list.map((f) => (
            <li key={f.id}>
              <button className={picked.has(f.planted_share_id) ? 'on' : ''} onClick={() => toggle(f.planted_share_id)}>
                <Flower flower={f} size={44} stem={false} bloom={false} />
                <b>{displayName(f)}</b>
                <small>{members.find((m) => m.id === f.sender_id)?.nickname || '친구'} · {formatDate(f.sent_date)}</small>
              </button>
            </li>
          ))}
        </ul>
        <button className="primary wide" disabled={busy || picked.size === 0} onClick={submit}>
          {busy ? '정리하는 중…' : picked.size ? `${picked.size}송이 정원에서 빼기` : '뺄 소리를 골라 주세요'}
        </button>
      </div>
    </div>
  )
}

function Album({ data, meId, onOpen, onOpenPair, flowerById }) {
  const rows = useMemo(() => {
    const byDate = {}
    // 앨범에는 친구에게 받은 소리만 (내가 보낸 소리는 친구 정원에 있다). 우리의 꽃은 함께 둔다
    for (const f of [...data.flowers.filter((x) => x.sender_id !== meId), ...(data.archived || [])]) (byDate[f.sent_date] ||= { date: f.sent_date, list: [], pairs: [] }).list.push(f)
    for (const p of data.pairs) (byDate[p.sent_date] ||= { date: p.sent_date, list: [], pairs: [] }).pairs.push(p)
    return Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date))
  }, [data, meId])

  const Day = ({ r }) => (
    <div className="album-day">
      <div className="album-date">{formatDate(r.date)}</div>
      <div className="album-flowers">
        {r.pairs.filter((p) => flowerById[p.flower_a_id] && flowerById[p.flower_b_id]).map((p) => (
          <button key={p.id} className="album-item pair" onClick={() => onOpenPair(p)}>
            <Flower flower={flowerById[p.flower_b_id]} colors={[flowerById[p.flower_a_id].color, flowerById[p.flower_b_id].color]} size={48} stem={false} />
            <b>{p.name}</b><small>우리의 꽃</small>
          </button>
        ))}
        {r.list.map((f) => (
          <button key={f.id} className="album-item" onClick={() => onOpen(f)}>
            <Flower flower={f} size={48} stem={false} />
            <b>{displayName(f)}</b>
            <small>{data.members.find((m) => m.id === f.sender_id)?.nickname || '친구'}{f.archived ? ' · 정리함' : ''}</small>
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <div className="page">
      {/* 받은 소리를 날짜별로 (오늘 · 어제 · 11월 5일 …). 주 단위로 나누지 않는다 */}
      <h1 className="page-title">앨범</h1>
      {rows.length === 0 && (
        <p className="album-empty">아직 받은 소리가 없어요</p>
      )}
      {rows.map((r) => <Day key={r.date} r={r} />)}
    </div>
  )
}

// 친구: 친구 코드(= 정원 코드)로 친구를 맺고, 친구마다 내 소리를 골라 공유한다.
// 친구가 공유한 소리는 내 정원 왼쪽에, 내 소리는 오른쪽에 핀다.
// 친구 탭: 친구 목록만. 친구 코드·친구 맺기는 나 탭(FriendCode)에 있다.
function Friends({ data, onOpen, onVisit, onGoMe }) {
  const [selectedId, setSelectedId] = useState(null) // 고른 친구 user_id

  const mineCount = (userId) => data.sentShares.filter((x) => x.to_user === userId).length
  const selected = data.friends.find((x) => x.user_id === selectedId)

  if (selected) {
    // 주고받은 소리: 말로 대화하는 대신, 이 친구와 소리를 주고받은 기록만 날짜순으로 (최근이 위)
    const byId = Object.fromEntries(data.flowers.map((f) => [f.id, f]))
    const at = (f) => f.shared_at || f.created_at
    const RECEIVED_STATE = { pending: '받은 소리함', accepted: '정원에 심음', declined: '괜찮아요', archived: '정원에서 뺌' }
    const received = data.receivedHistory.filter((f) => f.from_user === selected.user_id)
      .map((f) => ({ f, dir: 'in', at: at(f), state: RECEIVED_STATE[f.share_status] || '' }))
    const SENT_STATE = { pending: '고르는 중', accepted: '심음', declined: '안 받음', archived: '정원에서 뺌' }
    const sent = data.sentShares.filter((x) => x.to_user === selected.user_id && byId[x.flower_id])
      .map((x) => ({ f: byId[x.flower_id], dir: 'out', at: x.created_at, state: SENT_STATE[x.status] || '' }))
    const history = [...received, ...sent].sort((a, b) => String(b.at).localeCompare(String(a.at)))
    const since = new Date(selected.since)
    const day = (iso) => formatDate(new Date(iso).toLocaleDateString('sv-SE'))
    return (
      <div className="page friend-page">
        <button className="back-link" onClick={() => setSelectedId(null)} aria-label="친구 목록으로 돌아가기">←</button>
        {/* 정원 방문은 프로필 아래 버튼에서만 시작한다. */}
        <div className="friend-hero">
          <Avatar name={selected.nickname} url={selected.avatar_url} className="huge" />
          <h1 className="page-title">{selected.nickname}</h1>
          <small className="muted">{since.getMonth() + 1}월 {since.getDate()}일부터 친구 · 받은 소리 {received.length}개 · 보낸 소리 {mineCount(selected.user_id)}개</small>
          <button className="friend-visit" onClick={() => onVisit(selected)} aria-label={`${selected.nickname}의 정원 보기`}>
            <Sprout width={17} height={17} aria-hidden="true" />
            <span>정원 보기</span>
          </button>
        </div>

        <h2 className="page-sub">주고받은 소리</h2>
        {history.length === 0 ? (
          <p className="small muted">아직 {selected.nickname}와 주고받은 소리가 없어요.</p>
        ) : (
          <ul className="history-list">
            {history.map(({ f, dir, at: when, state }) => (
              <li key={`${dir}-${f.id}`} className={dir}>
                <button onClick={() => onOpen(f)}>
                  <Flower flower={f} size={34} stem={false} bloom={false} />
                  <span className="h-name">{displayName(f)}</span>
                  <small>{dir === 'in' ? '받음' : '보냄'} · {day(when)}{state ? ` · ${state}` : ''}</small>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <div className="page">
      <h1 className="page-title">친구</h1>

      {data.friends.length === 0 ? (
        <div className="friends-empty">
          <Users width={36} height={36} aria-hidden="true" />
          <h2>아직 친구가 없어요</h2>
          <p className="muted">친구를 등록하고 소리를 나눠 보세요.</p>
          <button className="ghost" onClick={onGoMe}>친구 등록하기</button>
        </div>
      ) : (
        <ul className="friend-list">
          {data.friends.map((fr) => {
            const theirs = data.receivedHistory.filter((f) => f.from_user === fr.user_id).length
            const waiting = data.inbox.filter((f) => f.from_user === fr.user_id).length
            return (
              <li key={fr.user_id}>
                <button className="card friend-row" onClick={() => setSelectedId(fr.user_id)}>
                  <Avatar name={fr.nickname} url={fr.avatar_url} className="big" />
                  <div>
                    <b>{fr.nickname}</b>
                    <small className="muted">받은 소리 {theirs}개 · 보낸 소리 {mineCount(fr.user_id)}개</small>
                  </div>
                  {waiting > 0 && <i className="count-badge">{waiting}</i>}
                  <span className="chev">›</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// 나 탭 프로필: 사진의 ＋를 누르면 바로 고르기(사진이 있으면 바꾸기/지우기), 닉네임은 고치고 나면 바로 반영
function Profile({ me, email, onSave }) {
  const nameRef = useRef(null)
  const [name, setName] = useState(me?.nickname || '')
  const [photoMenu, setPhotoMenu] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef(null)
  useEffect(() => { setName(me?.nickname || '') }, [me?.nickname])
  const wrapRef = useRef(null)
  // 사진 메뉴 밖을 누르면 닫는다
  useEffect(() => {
    if (!photoMenu) return
    const close = (e) => { if (!wrapRef.current?.contains(e.target)) setPhotoMenu(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [photoMenu])

  async function run(nickname, photo) {
    setBusy(true); setError('')
    try { await onSave(nickname, photo) } catch (e) { setError(e.message || String(e)); setName(me?.nickname || '') } finally { setBusy(false) }
  }
  const tapPhoto = () => (me?.avatar_url ? setPhotoMenu((o) => !o) : fileRef.current?.click())
  const pick = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    setPhotoMenu(false)
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('사진 파일을 골라 주세요.'); return }
    run(me?.nickname || '', file)
  }
  const commitName = () => {
    const n = name.trim()
    if (!n) { setName(me?.nickname || ''); return }
    if (n !== me?.nickname) run(n, null)
  }

  return (
    <section className={`profile${busy ? ' busy' : ''}`}>
      <div className="avatar-wrap" ref={wrapRef}>
        <button className="avatar-pick" onClick={tapPhoto} disabled={busy} aria-label="프로필 사진" aria-expanded={me?.avatar_url ? photoMenu : undefined}>
          <Avatar me url={me?.avatar_url} className="huge" />
          <span className="avatar-edit" aria-hidden="true">＋</span>
        </button>
        {photoMenu && (
          <div className="photo-menu" role="menu">
            <button role="menuitem" onClick={() => fileRef.current?.click()}>사진 바꾸기</button>
            <button role="menuitem" className="danger-text" onClick={() => { setPhotoMenu(false); run(me?.nickname || '', 'remove') }}>사진 지우기</button>
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={pick} />
      </div>
      <div className="nickname-editor">
      <div className="nickname-field">
      <span className="nickname-measure" aria-hidden="true">{name || '닉네임'}</span>
      <input
        ref={nameRef}
        className="name-input"
        value={name}
        maxLength={12}
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setName(me?.nickname || ''); setTimeout(() => e.target.blur()) } }}
        aria-label="닉네임"
        enterKeyHint="done"
      />
      </div>
      <button className="nickname-edit" aria-label="닉네임 수정" disabled={busy} onPointerDown={(e) => e.preventDefault()} onClick={() => { nameRef.current?.focus(); nameRef.current?.select() }}><Pencil width={15} height={15} aria-hidden="true" /></button>
      </div>
      <small className="muted">{email}</small>
      {error && <p className="error">{error}</p>}
    </section>
  )
}

// 내 코드(누르면 복사) + 친구 코드로 친구 맺기
function FriendCode({ code: myCode, onAdded }) {
  const [copied, setCopied] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function copy() {
    try { await navigator.clipboard.writeText(myCode) } catch {
      const t = document.createElement('textarea'); t.value = myCode; document.body.appendChild(t); t.select()
      try { document.execCommand('copy') } catch {}
      t.remove()
    }
    setCopied(true); setTimeout(() => setCopied(false), 1800)
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

  return (
    <div className="card friend-code">
      <button className="my-code" onClick={copy} aria-label={`내 코드 ${myCode} 복사하기`}>
        <small className="muted">내 코드</small>
        <span className="big-code">{myCode}</span>
        <small className={`code-copy-hint ${copied ? 'copied' : 'muted'}`}>{copied ? '복사했어요' : '눌러서 복사'}</small>
      </button>
      <hr />
      <form className="add-friend" onSubmit={(e) => { e.preventDefault(); if (code.length === 6 && !busy) add() }}>
        <input
          value={code}
          inputMode="numeric"
          maxLength={6}
          onChange={(e) => { setCode(e.target.value.replace(/\D/g, '')); setError(''); setNotice('') }}
          placeholder="친구 코드 6자리"
          aria-label="친구 코드"
          className="code-input"
        />
        <button className="primary" type="submit" disabled={busy || code.length !== 6}>{busy ? '맺는 중…' : '친구 맺기'}</button>
      </form>
      {notice && <p className="small notice">{notice}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  )
}

function Me({ me, email, onSignOut, code, onAdded, onSaveProfile }) {
  return (
    <div className="page me-page">
      <h1 className="page-title">나</h1>
      {/* 프로필(사진·닉네임), 내 코드·친구 맺기, 로그아웃. 설명은 도움말에 있다 */}
      <Profile me={me} email={email} onSave={onSaveProfile} />
      <FriendCode code={code} onAdded={onAdded} />
      <button className="link logout" onClick={onSignOut}>로그아웃</button>
    </div>
  )
}

function formatDate(d) {
  if (d === today()) return '오늘'
  if (d === new Date(Date.now() - 86400000).toLocaleDateString('sv-SE')) return '어제'
  const [, m, day] = d.split('-')
  return `${Number(m)}월 ${Number(day)}일`
}
