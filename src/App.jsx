import { useState } from 'react'
import Garden from './components/Garden.jsx'
import Flower from './components/Flower.jsx'
import { configured, createGarden, joinGarden, savedSession, saveSession } from './lib/db.js'

export default function App() {
  const [session, setSession] = useState(() => (configured ? savedSession() : null))

  if (!configured) return <SetupNeeded />
  if (session) return <Garden key={session.gardenId} session={session} onLeave={() => { saveSession(null); setSession(null) }} />
  return <Entry onEnter={(s) => { saveSession(s); setSession(s) }} />
}

// S1 입장: 정원 만들기(코드 발급) / 코드 입력, 닉네임
function Entry({ onEnter }) {
  const [nickname, setNickname] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function run(fn) {
    if (!nickname.trim()) { setError('닉네임을 적어 주세요.'); return }
    setBusy(true); setError('')
    try {
      const r = await fn()
      onEnter({ gardenId: r.garden_id, memberId: r.member_id, code: r.code })
    } catch (e) {
      setError(e.message || String(e))
    } finally { setBusy(false) }
  }

  return (
    <div className="screen entry center-col">
      <div className="hero">
        <Flower flower={{ color: 'hsl(335 70% 80%)', petals: 6, vowel: 'Y', consonant: '평', rms: 0.05 }} size={110} />
        <h1>소리숲</h1>
        <p className="slogan">말하지 않아도 괜찮아,<br />우리의 하루는 소리로 피어나.</p>
      </div>

      <label className="field">
        닉네임
        <input value={nickname} maxLength={12} onChange={(e) => setNickname(e.target.value)} placeholder="예: 여정" />
      </label>

      <button className="primary wide" disabled={busy} onClick={() => run(() => createGarden(nickname.trim()))}>
        새 정원 만들기
      </button>

      <div className="divider"><span>또는</span></div>

      <label className="field">
        정원 코드 6자리
        <input
          value={code}
          inputMode="numeric"
          maxLength={6}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          placeholder="123456"
          className="code-input"
        />
      </label>
      <button className="ghost wide" disabled={busy || code.length !== 6} onClick={() => run(() => joinGarden(code, nickname.trim()))}>
        정원에 들어가기
      </button>

      {error && <p className="error">{error}</p>}
    </div>
  )
}

function SetupNeeded() {
  return (
    <div className="screen center-col setup">
      <h1>소리숲 설정이 필요해요</h1>
      <ol>
        <li>Supabase 프로젝트를 만들고 SQL Editor에서 <code>supabase/schema.sql</code>을 실행</li>
        <li>Authentication에서 익명 로그인(Anonymous sign-ins) 켜기</li>
        <li><code>.env.example</code>을 <code>.env</code>로 복사해 URL과 anon key 입력</li>
        <li>개발 서버 다시 시작</li>
      </ol>
    </div>
  )
}
