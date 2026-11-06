import { useState } from 'react'
import Flower from './Flower.jsx'
import { displayName } from '../lib/tree.js'

// 소리 공유 시트. 두 가지로 연다.
//  - 꽃을 고른 뒤: flower가 주어지고 공유할 친구를 고른다
//  - 친구를 고른 뒤: friend가 주어지고 공유할 내 꽃을 고른다
// 이미 공유한 조합은 '공유함'으로 표시하고 다시 고를 수 없다.
export default function ShareSheet({ flower, friend, friends, myFlowers, sentShares, onSubmit, onClose }) {
  const shared = (flowerId, userId) => sentShares.some((s) => s.flower_id === flowerId && s.to_user === userId)
  const [picked, setPicked] = useState(() => new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const toggle = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  async function submit() {
    setBusy(true); setError('')
    try {
      if (flower) await onSubmit([flower.id], [...picked])
      else await onSubmit([...picked], [friend.user_id])
      onClose()
    } catch (e) {
      setError(e.message || String(e))
    } finally { setBusy(false) }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet share-sheet" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="닫기">×</button>
        {flower ? (
          <>
            <h2 className="sheet-title">‘{displayName(flower)}’을 누구에게 공유할까요?</h2>
            {friends.length === 0 && <p className="muted">아직 친구가 없어요. 메뉴 → 친구에서 친구 코드로 친구를 맺어 주세요.</p>}
            <ul className="pick-list">
              {friends.map((fr) => {
                const done = shared(flower.id, fr.user_id)
                return (
                  <li key={fr.user_id}>
                    <label className={done ? 'done' : ''}>
                      <input type="checkbox" disabled={done} checked={done || picked.has(fr.user_id)} onChange={() => toggle(fr.user_id)} />
                      <span className="av partner">{[...fr.nickname][0]}</span>
                      <b>{fr.nickname}</b>
                      {done && <small>공유함</small>}
                    </label>
                  </li>
                )
              })}
            </ul>
          </>
        ) : (
          <>
            <h2 className="sheet-title">{friend.nickname}에게 공유할 소리를 골라요</h2>
            {myFlowers.length === 0 && <p className="muted">아직 내 정원에 핀 소리가 없어요. 먼저 오늘의 소리를 녹음해 주세요.</p>}
            <ul className="pick-grid">
              {[...myFlowers].reverse().map((f) => {
                const done = shared(f.id, friend.user_id)
                return (
                  <li key={f.id}>
                    <button className={`${picked.has(f.id) ? 'on' : ''} ${done ? 'done' : ''}`} disabled={done} onClick={() => toggle(f.id)}>
                      <Flower flower={f} size={44} stem={false} bloom={false} />
                      <b>{displayName(f)}</b>
                      <small>{done ? '공유함' : f.sent_date.slice(5).replace('-', '/')}</small>
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        )}
        <button className="primary wide" disabled={busy || picked.size === 0} onClick={submit}>
          {busy ? '공유하는 중…' : picked.size ? `${picked.size}${flower ? '명에게' : '개'} 공유하기` : '공유하기'}
        </button>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  )
}
