import { useEffect, useState } from 'react'
import Garden from './components/Garden.jsx'
import Flower from './components/Flower.jsx'
import { clearPushForLogout } from './lib/push.js'
import {
  configured, createGarden,
  currentUser, onAuthChange, signIn, signUp, signOut, myLatestGarden,
} from './lib/db.js'

async function leaveAccount() {
  try { await clearPushForLogout() } catch { /* 푸시 정리 실패가 로그아웃을 막지 않도록 한다. */ }
  await signOut()
}

// 로그인 필수: 로그인 → (계정의 정원이 있으면 바로 입장 / 없으면 정원 만들기·코드 입장) → 정원
export default function App() {
  const [user, setUser] = useState(undefined) // undefined = 확인 중
  const [garden, setGarden] = useState(undefined) // undefined = 찾는 중, null = 없음

  useEffect(() => {
    if (!configured) return
    currentUser().then(setUser)
    return onAuthChange(setUser)
  }, [])

  // 로그인하면 그 계정의 정원을 찾는다
  useEffect(() => {
    if (!user) { setGarden(undefined); return }
    let alive = true
    setGarden(undefined)
    myLatestGarden()
      .then((g) => alive && setGarden(g))
      .catch(() => alive && setGarden(null))
    return () => { alive = false }
  }, [user?.id])

  if (!configured) return <SetupNeeded />
  if (user === undefined || (user && garden === undefined)) return <Splash />
  if (!user) return <AuthScreen />
  // 한 사람당 정원은 하나: 정원이 없을 때만 만들기·코드 입장 화면
  if (!garden) return <GardenSetup email={user.email} onEnter={setGarden} />
  return (
    <Garden
      key={garden.gardenId}
      session={garden}
      onSignOut={leaveAccount}
      email={user.email}
    />
  )
}

function Hero() {
  return (
    <div className="hero">
      <Flower flower={{ color: 'hsl(335 70% 80%)', petals: 6, vowel: 'Y', consonant: '평', rms: 0.05 }} size={110} />
      <h1>SUP</h1>
      <p className="slogan">말하지 않아도 괜찮아,<br />우리의 하루는 소리로 피어나.</p>
    </div>
  )
}

function Splash() {
  return <div className="screen center-col entry"><div className="seed" /></div>
}

// 로그인 / 가입
function AuthScreen() {
  const [mode, setMode] = useState('login') // login | signup
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function submit(e) {
    e.preventDefault()
    if (!email.trim() || !password) { setError('이메일과 비밀번호를 적어 주세요.'); return }
    if (mode === 'signup' && password !== password2) { setError('비밀번호가 서로 달라요.'); return }
    setBusy(true); setError(''); setNotice('')
    try {
      if (mode === 'signup') {
        const { needsConfirm } = await signUp(email.trim(), password)
        if (needsConfirm) {
          setNotice('확인 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해 주세요.')
          setMode('login')
        }
      } else {
        await signIn(email.trim(), password)
      }
      // 로그인에 성공하면 App이 onAuthChange로 다음 화면으로 넘어간다
    } catch (err) {
      setError(err.message || String(err))
    } finally { setBusy(false) }
  }

  const switchMode = (m) => { setMode(m); setError(''); setNotice('') }

  return (
    <div className="screen entry center-col">
      <Hero />
      <form className="auth-form" aria-label={mode === 'login' ? '로그인' : '회원가입'} onSubmit={submit}>
        <label className="field">
          <span>이메일</span>
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
        </label>
        <label className="field">
          <span>비밀번호</span>
          <input
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="6자 이상"
          />
        </label>
        {mode === 'signup' && (
          <label className="field">
            <span>비밀번호 확인</span>
            <input type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} />
          </label>
        )}
        <button className="primary wide" type="submit" disabled={busy}>
          {busy ? '잠시만요…' : mode === 'login' ? '로그인' : '가입하고 시작하기'}
        </button>
      </form>
      <button className="auth-switch" disabled={busy} onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}>
        {mode === 'login' ? '회원가입' : '로그인으로 돌아가기'}
      </button>
      {notice && <p className="notice">{notice}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  )
}

// 내 정원 만들기 (로그인한 뒤, 아직 정원이 없을 때). 친구는 정원 안의 친구 탭에서 맺는다
function GardenSetup({ email, onEnter }) {
  const [nickname, setNickname] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function run(fn) {
    if (!nickname.trim()) { setError('닉네임을 적어 주세요.'); return }
    setBusy(true); setError('')
    try {
      const r = await fn()
      // justCreated: 정원을 처음 만든 직후에만 튜토리얼을 띄운다
      onEnter({ gardenId: r.garden_id, memberId: r.member_id, code: r.code, justCreated: true })
    } catch (e) {
      setError(e.message || String(e))
    } finally { setBusy(false) }
  }

  return (
    <div className="screen entry center-col">
      <Hero />
      <p className="account-line">
        {email}로 로그인됨 · <button className="link" onClick={leaveAccount}>로그아웃</button>
      </p>
      <label className="field">
        닉네임
        <input value={nickname} maxLength={12} onChange={(e) => setNickname(e.target.value)} placeholder="예: 여정" />
      </label>

      <button className="primary wide" disabled={busy} onClick={() => run(() => createGarden(nickname.trim()))}>
        내 정원 만들기
      </button>

      <p className="small muted">친구는 정원을 만든 뒤 메뉴 → 친구에서 친구 코드로 맺을 수 있어요.</p>

      {error && <p className="error">{error}</p>}
    </div>
  )
}

function SetupNeeded() {
  return (
    <div className="screen center-col setup">
      <h1>SUP 설정이 필요해요</h1>
      <ol>
        <li>Supabase 프로젝트를 만들고 SQL Editor에서 <code>supabase/schema.sql</code>을 실행</li>
        <li>Authentication에서 Email 로그인 켜기 (해커톤은 Confirm email 끄기 권장)</li>
        <li><code>.env.example</code>을 <code>.env</code>로 복사해 URL과 anon key 입력</li>
        <li>개발 서버 다시 시작</li>
      </ol>
    </div>
  )
}
