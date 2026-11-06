import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Flower from './Flower.jsx'
import Island3D from './Island3D.jsx'
import Recorder from './Recorder.jsx'
import { FlowerDetail, PairDetail } from './Details.jsx'
import ShareSheet from './Share.jsx'
import Visit from './Visit.jsx'
import Avatar from './Avatar.jsx'
import PageHeading from './PageHeading.jsx'
import Tutorial, { HelpPage } from './Tutorial.jsx'
import PushSettings from './PushSettings.jsx'
import SoundPlayer from './SoundPlayer.jsx'
import AlbumPeriodPicker from './AlbumPeriodPicker.jsx'
import { displayName } from '../lib/tree.js'
import { ArrowLeft, Bell, Check, Heart, Help, Menu, Mic, Pencil, Pin, Sprout, Trash, User, Users, Wave } from './Icons.jsx'
import { FRIEND_LIMIT, GARDEN_LIMIT, addFriend, archiveShares, audioUrl, currentUser, deleteFlower, deleteReceivedSound, derivePairs, insertFlower, loadGarden, removeFriend, respondShare, shareFlowers, subscribeGarden, today, updateProfile, uploadAudio } from '../lib/db.js'
import { hideReceivedSounds, newestReceivedFirst, receivedSoundCollections } from '../lib/receivedSounds.js'
import { GardenThemeProvider, useGardenTheme } from '../lib/gardenTheme.jsx'
import { GARDEN_THEMES } from '../lib/gardenThemeStorage.js'
import { isBlenderGardenFlower } from '../lib/plantAppearance.js'

// 받침에 따라 조사 고르기
const hasBatchim = (w = '') => {
  const c = w.charCodeAt(w.length - 1)
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0
}
const josa = (w, a, b) => `${w}${hasBatchim(w) ? a : b}`

// demo: 개발용 미리보기(?view=home)에서만 넘긴다. 주면 Supabase 대신 그 데이터로 화면만 그린다.
export default function Garden(props) {
  return <GardenThemeProvider userId={props.userId} demo={Boolean(props.demo)}><GardenContent {...props} /></GardenThemeProvider>
}

function GardenContent({ session, onSignOut, email, demo, initialTab = 'garden' }) {
  const { tone } = useGardenTheme()
  const [themeStatus, setThemeStatus] = useState(null)
  const [retryThemeKey, setRetryThemeKey] = useState(0)
  const diagnosticsRef = useRef(null)
  const diagnostics = import.meta.env.DEV && new URLSearchParams(location.search).get('diagnostics') === '1'
  useEffect(() => {
    if (!diagnostics) return
    window.__gardenDiagnostics = diagnosticsRef
    return () => { delete window.__gardenDiagnostics }
  }, [diagnostics])
  const [rawData, setData] = useState(null)
  const hiddenSoundsKey = `sup.hidden-friend-sounds.v1.${demo ? 'demo' : session.memberId}`
  const [hiddenSounds, setHiddenSounds] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(hiddenSoundsKey))
      return { shares: Array.isArray(saved?.shares) ? saved.shares : [], pairs: Array.isArray(saved?.pairs) ? saved.pairs : [] }
    } catch { return { shares: [], pairs: [] } }
  })
  useEffect(() => {
    try { localStorage.setItem(hiddenSoundsKey, JSON.stringify(hiddenSounds)) } catch { /* 이번 화면에서는 숨김을 유지한다. */ }
  }, [hiddenSoundsKey, hiddenSounds])
  const data = useMemo(() => hideReceivedSounds(rawData, hiddenSounds), [rawData, hiddenSounds])
  const [error, setError] = useState('')
  const [tab, setTab] = useState(() => demo && ['garden', 'album', 'friends', 'me', 'help'].includes(initialTab) ? initialTab : 'garden')
  const [recording, setRecording] = useState(false)
  const [openFlower, setOpenFlower] = useState(null)
  const [openPair, setOpenPair] = useState(null)
  const [showBell, setShowBell] = useState(() => new URLSearchParams(location.search).get('inbox') === '1')
  const [menuOpen, setMenuOpen] = useState(() => new URLSearchParams(location.search).get('inbox') === '1')
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const tutorialPromptedRef = useRef(false)
  const [friendPicker, setFriendPicker] = useState(false) // '+N' 친구 고르기 창
  const pinKey = `sup.pinned-friends.v1.${demo ? 'demo' : session.memberId}`
  const [pinnedIds, setPinnedIds] = useState(() => {
    try {
      const value = JSON.parse(localStorage.getItem(pinKey))
      return Array.isArray(value) ? [...new Set(value.filter((id) => typeof id === 'string'))].slice(0, 3) : null
    } catch { return null }
  })
  useEffect(() => {
    if (!data) return
    if (pinnedIds === null) { setPinnedIds(data.friends.slice(0, 3).map((friend) => friend.user_id)); return }
    const valid = pinnedIds.filter((id) => data.friends.some((friend) => friend.user_id === id))
    if (valid.length !== pinnedIds.length) { setPinnedIds(valid); return }
    try { localStorage.setItem(pinKey, JSON.stringify(valid)) } catch { /* 저장할 수 없어도 이번 화면에서는 유지한다. */ }
  }, [data, pinnedIds, pinKey])
  function togglePin(id) {
    if (!(pinnedIds || []).includes(id) && (pinnedIds || []).length >= 3) {
      showToast('친구는 3명까지만 상단에 고정할 수 있어요.')
      return
    }
    setPinnedIds((previous) => {
      const ids = previous || []
      return ids.includes(id) ? ids.filter((value) => value !== id) : ids.length < 3 ? [...ids, id] : ids
    })
  }

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
  const [toastKey, setToastKey] = useState(0)
  const toastTimerRef = useRef(null)
  useEffect(() => () => clearTimeout(toastTimerRef.current), [])
  const [answerBusy, setAnswerBusy] = useState(false)
  const answeringRef = useRef(false)
  const [gardenViewReset, setGardenViewReset] = useState(0)
  const [fresh, setFresh] = useState(() => new Set())
  const [highlight, setHighlight] = useState(null)
  const [sharePick, setSharePick] = useState(null) // { flower } 또는 { friend }
  const [visiting, setVisiting] = useState(null) // 놀러 간 친구
  const sheetRef = useRef(null)
  const homeRef = useRef(null)
  const titleRef = useRef(null)

  // 제목과 하단 버튼의 실제 높이 사이에 정원을 맞춘다.
  const hasSheet = Boolean(data) && tab === 'garden'
  useLayoutEffect(() => {
    const home = homeRef.current, sheet = sheetRef.current
    if (!home || !sheet) return
    const measure = () => {
      // 플로팅 도구 아래 여백에는 기기 안전 영역과 정원 여백이 포함된다.
      const style = getComputedStyle(sheet)
      const tabH = parseFloat(style.bottom) || 0
      const sheetH = sheet.offsetHeight
      const title = titleRef.current
      const top = title ? title.offsetTop + title.offsetHeight + 12 : 120
      home.style.setProperty('--island-top', `${top}px`)
      home.style.setProperty('--island-bottom', `${tabH + sheetH + 12}px`)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(home); ro.observe(sheet)
    if (titleRef.current) ro.observe(titleRef.current)
    // Android가 시스템바 높이를 늦게 전달하거나 회전으로 바꾸는 경우에도 정원 여백을 갱신한다.
    const insetsObserver = new MutationObserver(measure)
    insetsObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] })
    return () => { ro.disconnect(); insetsObserver.disconnect() }
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
      const history = status === null ? d.receivedHistory.filter((f) => !shareIds.includes(f.share_id))
        : d.receivedHistory.map((f) => shareIds.includes(f.share_id) ? { ...f, share_status: status } : f)
      const collections = receivedSoundCollections(history)
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
      showToast(`정원에는 ${GARDEN_LIMIT}개까지 심을 수 있어요. 앨범에서 정리한 뒤 다시 심어 주세요.`)
      closeMenu()
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
      showToast(accept ? `${josa(displayName(item), '을', '를')} 정원에 심었어요` : '받지 않았어요')
      setOpenFlower(null)
    } catch (e) {
      showToast(e.message || String(e))
    } finally {
      answeringRef.current = false
      setAnswerBusy(false)
    }
  }

  async function handleShare(flowerIds, userIds) {
    await shareFlowers(flowerIds, userIds)
    showToast('소리를 공유했어요')
    await refresh()
  }

  async function albumAction(item, remove) {
    if (answeringRef.current) return
    answeringRef.current = true
    setAnswerBusy(true)
    try {
      if (demo) updateDemoReceived([item.share_id], remove ? null : 'archived')
      else {
        if (remove) await deleteReceivedSound(item.share_id)
        else await archiveShares([item.share_id])
        await refresh()
      }
      setOpenFlower(null)
      showToast(remove ? '앨범에서 삭제했어요' : '정원에서 뺐어요')
    } catch (e) {
      showToast(e.message || String(e))
    } finally {
      answeringRef.current = false
      setAnswerBusy(false)
    }
  }

  function markFresh(id) {
    setFresh((s) => new Set(s).add(id))
    setTimeout(() => setFresh((s) => { const n = new Set(s); n.delete(id); return n }), 5000)
  }
  function showToast(t) {
    clearTimeout(toastTimerRef.current)
    setToast(t)
    setToastKey((key) => key + 1)
    toastTimerRef.current = setTimeout(() => setToast(''), 2000)
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

  async function handleRemoveFriend(friend, hideSounds) {
    if (demo) {
      setData((previous) => ({
        ...previous,
        friends: previous.friends.filter((item) => item.user_id !== friend.user_id),
        members: previous.members.filter((item) => item.user_id !== friend.user_id),
      }))
    } else {
      await removeFriend(friend.user_id)
    }
    if (hideSounds) {
      setHiddenSounds((previous) => ({
        shares: [...new Set([...previous.shares, ...rawData.receivedHistory.filter((flower) => flower.from_user === friend.user_id).map((flower) => flower.share_id)])],
        pairs: [...new Set([...previous.pairs, ...rawData.pairs.filter((pair) => pair.friend === friend.user_id).map((pair) => pair.id)])],
      }))
    }
    if (!demo) await refresh()
    showToast(hideSounds ? '친구를 삭제하고 관련 꽃을 화면에서 숨겼어요.' : '꽃은 남겨두고 친구를 삭제했어요.')
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

  const me = data.members.find((m) => m.id === meId)
  const nameOf = (userId) => data.friends.find((x) => x.user_id === userId)?.nickname || '친구'
  const flowerById = Object.fromEntries(data.flowers.map((f) => [f.id, f]))

  const receivedCount = data.flowers.filter((f) => f.sender_id !== meId).length
  // 친구별 보기는 내 정원에 심어진 소리를 친구별로 구분한다.
  const friends = data.members.filter((m) => m.id !== meId)
  const plantedCount = (id) => data.flowers.filter((f) => f.sender_id === id).length
  const viewing = friends.some((m) => m.id === viewFriend) ? viewFriend : 'all'
  // 최근에 소리를 주고받은 친구 순 (받은 소리의 공유 시각, 내가 보낸 공유 시각 중 늦은 것)
  const lastTouch = (m) => {
    const got = data.flowers.filter((f) => f.sender_id === m.id).map((f) => f.shared_at || f.created_at)
    const gave = data.sentShares.filter((x) => x.to_user === m.user_id).map((x) => x.created_at)
    return [...got, ...gave].sort().pop() || m.created_at || ''
  }
  const byRecent = [...friends].sort((a, b) => lastTouch(b).localeCompare(lastTouch(a)))
  const pillFriends = (pinnedIds || []).map((id) => friends.find((friend) => friend.user_id === id)).filter(Boolean)
  const moreCount = friends.length - pillFriends.length
  // 내 정원에는 친구에게 받은 소리만 핀다 (내가 보낸 소리는 친구 정원에, 둘이 만나면 가운데 우리의 꽃)
  const gardenFlowers = data.flowers.filter((f) => f.sender_id !== meId)
  const shownFlowers = viewing === 'all' ? gardenFlowers : gardenFlowers.filter((f) => f.sender_id === viewing)
  const shownPairs = viewing === 'all' ? data.pairs : data.pairs.filter((p) =>
    flowerById[p.flower_a_id]?.sender_id === viewing || flowerById[p.flower_b_id]?.sender_id === viewing)
  // 친구별 보기: 섬에 보일 꽃 id (전체면 null → 모두). 문자열이라 값이 같으면 섬을 다시 만들지 않는다
  const visibleKey = viewing === 'all' ? null : [...shownFlowers.map((f) => f.id), ...shownPairs.map((p) => p.id)].join(',')

  return (
    <div ref={homeRef} className="home" data-garden-theme={tone}>
      <div className="sky">
        <div className="cloud c1" /><div className="cloud c2" /><div className="cloud c3" />
      </div>

          <div className={`island-touch${tab === 'garden' ? '' : ' garden-island-hidden'}`} aria-hidden={tab !== 'garden'}>
          <Island3D
            tone={tone}
            onThemeStatus={setThemeStatus}
            retryThemeKey={retryThemeKey}
            isBlenderFlower={isBlenderGardenFlower}
            active={tab === 'garden'}
            previewApi={diagnostics ? diagnosticsRef : undefined}
            resetViewKey={gardenViewReset}
            flowers={data.flowers}
            pairs={data.pairs}
            visibleIds={visibleKey}
            meId={meId}
            freshIds={fresh}
            highlightId={highlight}
            onPickFlower={setOpenFlower}
            onPickPair={setOpenPair}
          />
          </div>
      {tab === 'garden' && (
        <>
          <div ref={titleRef} className="home-title">
            <span className="wordmark" aria-label="SUP">SUP</span>
            <h1><button className="garden-view-reset" onClick={() => setGardenViewReset((n) => n + 1)} aria-label={`${me?.nickname}의 정원 시점 초기화`}>{me?.nickname}의 정원</button></h1>
            {friends.length > 0 && (
              <div className="view-pills" role="tablist" aria-label="정원에서 누구의 꽃을 볼까요">
                <button role="tab" aria-selected={viewing === 'all'} className={viewing === 'all' ? 'on' : ''} onClick={() => setViewFriend('all')}>
                  전체 <b>{receivedCount}</b>
                </button>
                {pillFriends.map((m) => (
                  <button key={m.id} role="tab" aria-selected={viewing === m.id} className={viewing === m.id ? 'on' : ''} onClick={() => setViewFriend(viewing === m.id ? 'all' : m.id)}>
                    {m.nickname} <b>{plantedCount(m.id)}</b>
                  </button>
                ))}
                {friends.length > 0 && (
                  <button className={`more-pill${viewing !== 'all' && !pillFriends.some((friend) => friend.id === viewing) ? ' on' : ''}`} onClick={() => setFriendPicker(true)} aria-label="친구 선택 및 고정">{moreCount > 0 ? `＋${moreCount}` : <Pin width={16} height={16} aria-hidden="true" />}</button>
                )}
              </div>
            )}
          </div>
          <section ref={sheetRef} className="home-sheet" aria-label="정원 도구">
            <div className="garden-guidance">
              <small className="garden-listen-hint">
                {gardenFlowers.length === 0 && data.pairs.length === 0
                  ? '아직 핀 꽃이 없어요'
                  : '꽃·나무를 눌러 소리를 들어 보세요'}
              </small>
            </div>
            <div className="garden-actions">
              <button className="comfort-btn" onClick={comfort}><Heart /> 오늘의 위로</button>
              <button className="record-cta" onClick={() => setRecording(true)} aria-label="오늘의 소리 녹음하기">
                <Mic /> 오늘의 소리 <small>10초</small>
              </button>
            </div>
          </section>
        </>
      )}

      {tab === 'album' && <Album data={data} meId={meId} onOpen={setOpenFlower} onOpenPair={setOpenPair} flowerById={flowerById} />}
      {tab === 'friends' && <Friends data={data} onRemove={handleRemoveFriend} onOpen={setOpenFlower} onVisit={setVisiting} onGoMe={() => setTab('me')} />}
      {tab === 'me' && <Me friendCount={data.friends.length} demo={Boolean(demo)} me={me} email={email} onSignOut={onSignOut} code={data.garden.code} onAdded={refresh} onSaveProfile={saveProfile} themeStatus={themeStatus} onRetryTheme={() => setRetryThemeKey(value => value + 1)} />}
      {tab === 'help' && <HelpPage onTutorial={() => setTutorialOpen(true)} />}

      {/* 오른쪽 위 메뉴 (아래 탭바 대신). 어느 화면에서나 같은 자리에 있다 */}
      {/* 정원이 아닌 화면(앨범·친구·나·도움말)에서는 메뉴 왼쪽의 ←로 정원으로 돌아간다. 그래서 메뉴에는 '정원' 항목이 없다 */}
      {tab !== 'garden' && (
        <button className="round-btn garden-back-btn" onClick={() => { setTab('garden'); closeMenu() }} aria-label="정원으로 돌아가기">
          <ArrowLeft />
        </button>
      )}
      <button ref={menuButtonRef} className="round-btn menu-btn" onClick={() => menuOpen ? closeMenu() : setMenuOpen(true)} aria-label="메뉴" aria-expanded={menuOpen} aria-controls="garden-menu">
        <Menu />
        {data.inbox.length > 0 && <i className="badge" />}
      </button>
      {menuOpen && (
        <>
          <div className="menu-backdrop" onClick={closeMenu} />
          <div id="garden-menu" className={`menu${showBell ? ' menu-expanded' : ''}${showBell && data.inbox.length === 0 ? ' menu-empty' : ''}`}>
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

      {tutorialOpen && <Tutorial demo={Boolean(demo)} onDone={finishTutorial} />}
      {toast && <div key={toastKey} className="toast" role="status" aria-live="polite">{toast}</div>}
      {recording && <Recorder onClose={() => setRecording(false)} onSend={handleSend} friends={data.friends} />}
      {openFlower && (
        <FlowerDetail
          flower={openFlower}
          bloom={tab !== 'album'}
          sender={data.members.find((m) => m.id === openFlower.sender_id)}
          mine={openFlower.sender_id === meId}
          sharedWith={data.sentShares.filter((x) => x.flower_id === openFlower.id).map((x) => `${nameOf(x.to_user)}${x.status === 'pending' ? '(고르는 중)' : x.status === 'declined' ? '(안 받음)' : ''}`)}
          onShare={tab === 'friends' ? undefined : () => setSharePick({ flower: openFlower })}
          onAccept={tab !== 'album' && openFlower.share_id && openFlower.share_status !== 'accepted' ? () => answer(openFlower, true) : undefined}
          onDecline={tab !== 'album' && openFlower.share_id && openFlower.share_status === 'pending' ? () => answer(openFlower, false) : undefined}
          onGardenToggle={tab === 'album' && openFlower.share_id ? () => openFlower.share_status === 'accepted' ? albumAction(openFlower, false) : answer(openFlower, true) : undefined}
          onDeleteReceived={tab === 'album' && openFlower.share_id ? () => albumAction(openFlower, true) : undefined}
          answerBusy={answerBusy}
          onClose={() => setOpenFlower(null)}
          onDelete={handleDelete}
        />
      )}
      {openPair && flowerById[openPair.flower_a_id] && flowerById[openPair.flower_b_id] && (
        <PairDetail
          pair={openPair}
          bloom={tab !== 'album'}
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
      {friendPicker && (
        <FriendPicker
          friends={byRecent}
          counts={Object.fromEntries(friends.map((m) => [m.id, plantedCount(m.id)]))}
          viewing={viewing}
          pinnedIds={pinnedIds || []}
          onTogglePin={togglePin}
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
  const bodyRef = useRef(null)
  const scrollTimerRef = useRef(null)
  const [scrolling, setScrolling] = useState(false)
  useEffect(() => () => clearTimeout(scrollTimerRef.current), [])
  const handleScroll = () => {
    setScrolling(true)
    clearTimeout(scrollTimerRef.current)
    scrollTimerRef.current = setTimeout(() => setScrolling(false), 800)
  }
  useLayoutEffect(() => {
    const body = bodyRef.current
    if (!body || !items.length) return
    const rows = [...body.querySelectorAll('.menu-inbox-list > li')].slice(0, 3)
    const measure = () => {
      const style = getComputedStyle(body)
      const gap = parseFloat(getComputedStyle(body.querySelector('.menu-inbox-list')).gap) || 0
      const total = rows.reduce((sum, row) => {
        const player = row.querySelector('[id^="inbox-audio-"]')
        return sum + row.getBoundingClientRect().height - (player?.getBoundingClientRect().height || 0)
      }, 0)
      const cap = total / rows.length * 3 + gap * 2 + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
      body.style.setProperty('--inbox-list-max-height', `${Math.ceil(cap)}px`)
    }
    measure()
    const observer = new ResizeObserver(measure)
    rows.forEach((row) => observer.observe(row))
    return () => observer.disconnect()
  }, [items])
  return (
    <div ref={bodyRef} onScroll={handleScroll} className={`menu-inbox-body${items.length === 0 ? ' is-empty' : ''}${scrolling ? ' is-scrolling' : ''}`}>
      {items.length === 0 ? (
        <div className="inbox-empty"><Bell /><p>새로 도착한 소리가 없어요.</p></div>
      ) : (
        <ul className="menu-inbox-list">
          {newestReceivedFirst(items).map((f) => (
            <li key={f.share_id}>
              <button className="menu-inbox-item" onClick={() => setPlayingId((id) => id === f.share_id ? null : f.share_id)} aria-label={`${displayName(f)} 듣기`} aria-expanded={playingId === f.share_id} aria-controls={`inbox-audio-${f.share_id}`}>
                <Flower flower={f} size={40} stem={false} bloom={false} />
                <span><b>{displayName(f)}</b><small>{nameOf(f.from_user)} · {formatDate(new Date(f.shared_at || f.created_at).toLocaleDateString('sv-SE'))}</small></span>
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
    : url ? <SoundPlayer src={url} autoPlay label={displayName(flower)} flower={flower} />
      : <p className="small muted" role="status">소리를 불러오는 중…</p>
}

// 전체 목록에서 정원에 표시할 친구와 상단에 고정할 친구를 고른다.
function FriendPicker({ friends, counts, viewing, pinnedIds, onTogglePin, onPick, onClose }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet friend-picker" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="닫기">×</button>
        <h2 className="sheet-title">정원에서 누구의 꽃을 볼까요?</h2>
        <button className={`picker-all${viewing === 'all' ? ' on' : ''}`} aria-pressed={viewing === 'all'} onClick={() => onPick('all')}>
          <span className="picker-all-icon"><Sprout width={20} height={20} aria-hidden="true" /></span>
          <span>모든 꽃 보기</span>
          {viewing === 'all' && <Check className="picker-all-check" width={18} height={18} aria-hidden="true" />}
        </button>
        <ul className="list">
          {friends.map((m) => {
            const pinned = pinnedIds.includes(m.user_id)
            return (
              <li key={m.id} className={`picker-friend-row${viewing === m.id ? ' on' : ''}`}>
                <button className={`picker-friend${viewing === m.id ? ' on' : ''}`} onClick={() => onPick(m.id)}>
                  <span className="av partner">{[...m.nickname][0]}</span>
                  <div className="picker-friend-name"><b>{m.nickname}</b><small>정원에 심은 소리</small></div>
                  <span className="picker-friend-count">{counts[m.id] || 0}<small>개</small></span>
                </button>
                <button className="friend-pin" aria-label={`${m.nickname} 상단 고정${pinned ? ' 해제' : ''}`} aria-pressed={pinned}
                  onClick={() => onTogglePin(m.user_id)}>
                  <Pin aria-hidden="true" />
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

function AlbumArtwork({ flower, colors, planted }) {
  return <span className="album-art"><Flower flower={flower} colors={colors} size={48} stem={false} />{planted && <span className="album-planted" aria-label="정원에 심은 소리"><Check width={14} height={14} strokeWidth={2.4} aria-hidden="true" /></span>}</span>
}

function Album({ data, meId, onOpen, onOpenPair, flowerById }) {
  const rows = useMemo(() => {
    const byDate = {}
    // 앨범에는 친구에게 받은 소리만 (내가 보낸 소리는 친구 정원에 있다). 우리의 꽃은 함께 둔다
    for (const f of data.receivedHistory) (byDate[f.sent_date] ||= { date: f.sent_date, list: [], pairs: [] }).list.push(f)
    for (const p of data.pairs) (byDate[p.sent_date] ||= { date: p.sent_date, list: [], pairs: [] }).pairs.push(p)
    return Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date))
  }, [data, meId])

  const years = [...new Set(rows.map((row) => row.date.slice(0, 4)))].sort().reverse()
  const [year, setYear] = useState(() => rows[0]?.date.slice(0, 4) || 'all')
  const [month, setMonth] = useState(() => rows[0]?.date.slice(5, 7) || 'all')
  const selectedYear = year === 'all' || years.includes(year) ? year : years[0] || 'all'
  const months = [...new Set(rows.filter((row) => row.date.startsWith(selectedYear + '-')).map((row) => row.date.slice(5, 7)))].sort().reverse()
  const selectedMonth = selectedYear === 'all' ? 'all' : month === 'all' || months.includes(month) ? month : months[0] || 'all'
  const filtered = rows.filter((row) => (selectedYear === 'all' || row.date.startsWith(selectedYear + '-'))
    && (selectedMonth === 'all' || row.date.slice(5, 7) === selectedMonth))
  const dayCount = (row) => row.list.length + row.pairs.filter((pair) => flowerById[pair.flower_a_id] && flowerById[pair.flower_b_id]).length
  const periodTotal = filtered.reduce((sum, row) => sum + dayCount(row), 0)
  const periodLabel = selectedYear === 'all' ? '전체 기간'
    : selectedMonth === 'all' ? `${selectedYear}년 전체` : `${selectedYear}년 ${Number(selectedMonth)}월`
  const scrollRef = useRef(null)
  useLayoutEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0 }, [selectedYear, selectedMonth])

  const renderDay = (r) => (
    <div key={r.date} className="album-day">
      <div className="album-date-line">
        <time className="album-date" dateTime={r.date}>{formatDate(r.date)}</time>
        <small>{dayCount(r)}</small>
      </div>
      <div className="album-flowers">
        {r.pairs.filter((p) => flowerById[p.flower_a_id] && flowerById[p.flower_b_id]).map((p) => (
          <button key={p.id} className="album-item pair" onClick={() => onOpenPair(p)}>
            <AlbumArtwork flower={flowerById[p.flower_b_id]} colors={[flowerById[p.flower_a_id].color, flowerById[p.flower_b_id].color]} planted />
            <b>{p.name}</b><small>우리의 꽃</small>
          </button>
        ))}
        {r.list.map((f) => (
          <button key={f.id} className="album-item" onClick={() => onOpen(f)}>
            <AlbumArtwork flower={f} planted={f.share_status === 'accepted'} />
            <b>{displayName(f)}</b>
            <small>{data.members.find((m) => m.id === f.sender_id)?.nickname || '친구'}</small>
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <div className="page fixed-heading-page">
      {/* 받은 소리를 날짜별로 (오늘 · 어제 · 11월 5일 …). 주 단위로 나누지 않는다 */}
      <PageHeading>앨범</PageHeading>
      {rows.length > 0 && <div className="album-period" role="group" aria-label="앨범 기간 선택">
        <AlbumPeriodPicker label="앨범 연도" value={selectedYear}
          options={[{ value: 'all', label: '전체 연도' }, ...years.map((value) => ({ value, label: `${value}년` }))]}
          onChange={(value) => { setYear(value); setMonth('all') }} />
        <AlbumPeriodPicker label="앨범 월" value={selectedMonth} disabled={selectedYear === 'all'}
          options={[{ value: 'all', label: '전체 월' }, ...months.map((value) => ({ value, label: `${Number(value)}월` }))]}
          onChange={setMonth} />
        <small className="album-period-total" aria-live="polite">{periodLabel}의 소리는 {periodTotal.toLocaleString('ko-KR')}개예요</small>
      </div>}
      <div ref={scrollRef} className="page-scroll" aria-label="앨범 목록">
      {rows.length === 0 && (
        <p className="album-empty">아직 받은 소리가 없어요</p>
      )}
      {filtered.map(renderDay)}
      </div>
    </div>
  )
}

// 친구: 친구 코드(= 정원 코드)로 친구를 맺고, 친구마다 내 소리를 골라 공유한다.
// 친구가 공유한 소리는 내 정원 왼쪽에, 내 소리는 오른쪽에 핀다.
// 친구 탭: 친구 목록만. 친구 코드·친구 맺기는 나 탭(FriendCode)에 있다.
function Friends({ data, onOpen, onVisit, onGoMe, onRemove }) {
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [hideSounds, setHideSounds] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState('')
  const removingRef = useRef(false)
  async function handleRemove(friend) {
    if (removingRef.current) return
    removingRef.current = true
    setRemoving(true)
    setRemoveError('')
    try {
      await onRemove(friend, hideSounds)
      setSelectedId(null)
      setConfirmRemove(false)
    } catch (error) {
      setRemoveError(error.message || '친구를 삭제하지 못했어요. 다시 시도해 주세요.')
    } finally {
      removingRef.current = false
      setRemoving(false)
    }
  }
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
      <div className="page friend-page fixed-heading-page">
        <PageHeading>친구</PageHeading>
        <div className="page-scroll" aria-label="친구 소리 내역">
        <button className="back-link" disabled={removing} onClick={() => { setSelectedId(null); setConfirmRemove(false); setRemoveError('') }} aria-label="친구 목록으로 돌아가기"><ArrowLeft aria-hidden="true" /></button>
        {/* 정원 방문은 프로필 아래 버튼에서만 시작한다. */}
        <div className="friend-hero">
          <Avatar name={selected.nickname} url={selected.avatar_url} className="huge" />
          <h1 className="page-title">{selected.nickname}</h1>
          <small className="muted">{since.getMonth() + 1}월 {since.getDate()}일부터 친구 · 받은 소리 {received.length}개 · 보낸 소리 {mineCount(selected.user_id)}개</small>
          <div className="friend-profile-actions">
          <button className="friend-visit" disabled={removing} onClick={() => onVisit(selected)} aria-label={`${selected.nickname}의 정원 보기`}>
            <Sprout width={17} height={17} aria-hidden="true" />
            <span>정원 보기</span>
          </button>
          <button className="friend-remove" disabled={removing} onClick={() => { setConfirmRemove(true); setHideSounds(false); setRemoveError('') }} aria-expanded={confirmRemove}>
            <Trash width={17} height={17} aria-hidden="true" />친구 삭제
          </button>
          </div>
          {confirmRemove && <div className="friend-remove-confirm" role="group" aria-label="친구 삭제 확인">
            <p>{selected.nickname}님을 친구 목록에서 삭제할까요?<br /><span className="muted">다시 친구 코드를 등록할 수 있어요.</span></p>
            <fieldset className="friend-flower-choice" disabled={removing}>
              <legend>주고받은 꽃·나무는 어떻게 할까요?</legend>
              <label><input type="radio" name="friend-flowers" checked={!hideSounds} onChange={() => setHideSounds(false)} />꽃 남기기</label>
              <label><input type="radio" name="friend-flowers" checked={hideSounds} onChange={() => setHideSounds(true)} />화면에서 숨기기</label>
              <small>숨김은 이 기기에만 적용돼요. 원본 소리는 그대로 남아요.</small>
            </fieldset>
            <div className="row">
              <button className="ghost small-btn" disabled={removing} onClick={() => { setConfirmRemove(false); setRemoveError('') }}>취소</button>
              <button className="danger small-btn" disabled={removing} onClick={() => handleRemove(selected)}>{removing ? '삭제 중…' : '친구 삭제하기'}</button>
            </div>
            {removeError && <p className="error" role="alert">{removeError}</p>}
          </div>}
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
      </div>
    )
  }

  return (
    <div className="page fixed-heading-page">
      <PageHeading>친구</PageHeading>
      <div className="page-scroll" aria-label="친구 목록">

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
function FriendCode({ friendCount, code: myCode, onAdded }) {
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

  const full = friendCount >= FRIEND_LIMIT
  async function add() {
    if (full) { setError(`친구는 최대 ${FRIEND_LIMIT}명까지 맺을 수 있어요.`); return }
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
      <form className="add-friend" onSubmit={(e) => { e.preventDefault(); if (code.length === 6 && !busy && !full) add() }}>
        <input
          value={code}
          inputMode="numeric"
          maxLength={6}
          onChange={(e) => { setCode(e.target.value.replace(/\D/g, '')); setError(''); setNotice('') }}
          placeholder="친구 코드 6자리"
          disabled={full}
          aria-label="친구 코드"
          className="code-input"
        />
        <button className="primary" type="submit" disabled={full || busy || code.length !== 6}>{busy ? '맺는 중…' : '친구 맺기'}</button>
      </form>
      {full && <p className="small muted">친구는 최대 {FRIEND_LIMIT}명까지 맺을 수 있어요.</p>}
      {notice && <p className="small notice">{notice}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  )
}

function Me({ friendCount, demo, me, email, onSignOut, code, onAdded, onSaveProfile, themeStatus, onRetryTheme }) {
  return (
    <div className="page me-page">
      <PageHeading>나</PageHeading>
      {/* 프로필(사진·닉네임), 내 코드·친구 맺기, 로그아웃. 설명은 도움말에 있다 */}
      <div className="me-content">
      <Profile me={me} email={email} onSave={onSaveProfile} />
      <GardenThemeSelector themeStatus={themeStatus} onRetry={onRetryTheme} />
      <FriendCode friendCount={friendCount} code={code} onAdded={onAdded} />
      <PushSettings demo={demo} />
      <button className="link logout" onClick={onSignOut}>로그아웃</button>
      </div>
    </div>
  )
}

function GardenThemeSelector({ themeStatus, onRetry }) {
  const { tone, setTone, saved } = useGardenTheme()
  return (
    <section className="garden-theme-settings" aria-labelledby="garden-theme-heading">
      <h3 id="garden-theme-heading">정원 테마</h3>
      <div className="garden-theme-options" role="group" aria-label="정원 테마">
        {GARDEN_THEMES.map(({ id, name }) => (
          <button key={id} type="button" className="garden-theme-option" aria-pressed={tone === id} onClick={() => setTone(id)}>
            <span className={`garden-theme-swatch swatch-${id}`} aria-hidden="true"><i /><i /><i /></span>
            <span className="garden-theme-name">{name}</span>
            <span className="garden-theme-check" aria-hidden="true">{tone === id ? '✓' : ''}</span>
          </button>
        ))}
      </div>
      <p className="garden-theme-note" role="status">{saved ? '이 기기에서 내가 보는 정원에만 적용돼요.' : '지금은 기기에 저장할 수 없어요. 이번에는 선택한 테마로 볼 수 있어요.'}</p>
      {themeStatus?.tone === tone && themeStatus.status === 'loading' && <p className="garden-theme-note" role="status">테마를 준비하고 있어요…</p>}
      {themeStatus?.tone === tone && themeStatus.status === 'error' && <p className="garden-theme-note" role="status">테마를 불러오지 못했어요. <button type="button" className="link" onClick={onRetry}>다시 시도</button></p>}
    </section>
  )
}

function formatDate(d) {
  if (d === today()) return '오늘'
  if (d === new Date(Date.now() - 86400000).toLocaleDateString('sv-SE')) return '어제'
  const [, m, day] = d.split('-')
  return `${Number(m)}월 ${Number(day)}일`
}
