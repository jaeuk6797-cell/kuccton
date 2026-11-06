import { useEffect, useState } from 'react'
import Island3D from './Island3D.jsx'
import FlowerBloom3D from './FlowerBloom3D.jsx'
import { loadVisit } from '../lib/db.js'
import { displayName, isTree } from '../lib/tree.js'

// 친구 정원에 놀러 가기: 친구면 언제든 갈 수 있지만 모양만 구경한다. 소리는 들을 수 없다.
// (DB에서도 방문할 때는 소리 파일 경로와 꽃말을 내려주지 않는다 — migrations-008.sql)
// 친구 정원 = 그 친구가 받아서 심은 소리들
export default function Visit({ friend, onClose }) {
  const [flowers, setFlowers] = useState(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(null)

  useEffect(() => {
    loadVisit(friend)
      .then(setFlowers)
      .catch((e) => setError(e.message || String(e)))
  }, [friend.user_id])

  const trees = flowers?.filter(isTree).length ?? 0
  const blooms = (flowers?.length ?? 0) - trees

  return (
    <div className="home sheet-closed visit">
      <div className="sky">
        <div className="cloud c1" /><div className="cloud c2" /><div className="cloud c3" />
      </div>
      {flowers && (
        <div className="island-touch">
          <Island3D flowers={flowers} pairs={[]} meId={friend.member_id} onPickFlower={setOpen} onPickPair={() => {}} />
        </div>
      )}
      <div className="home-title">
        <span className="wordmark">놀러 왔어요</span>
        <h1>{friend.nickname}의 정원</h1>
        {flowers && <p className="visit-sub">꽃 {blooms}송이 · 나무 {trees}그루 · 눌러서 구경해 보세요</p>}
      </div>
      {!flowers && !error && <div className="empty-garden"><b>정원으로 가는 중…</b></div>}
      {flowers && flowers.length === 0 && <div className="empty-garden"><b>아직 심은 소리가 없는 정원이에요</b></div>}
      {error && <div className="empty-garden"><b>정원에 들어가지 못했어요</b><small>{error}</small></div>}
      <button className="ghost visit-back" onClick={onClose}>← 내 정원으로</button>

      {open && (
        <div className="sheet-backdrop" onClick={() => setOpen(null)}>
          <div className="sheet center-col visit-card" onClick={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setOpen(null)} aria-label="닫기">×</button>
            <FlowerBloom3D flower={open} size={150} />
            <h2 className="flower-name">{displayName(open)}</h2>
            <p className="reason">{open.reason}</p>
            <p className="muted small">{open.sender_name || '친구'}가 {friend.nickname}에게 보낸 {isTree(open) ? '나무' : '꽃'}</p>
            <p className="visit-lock">🔒 소리는 {friend.nickname}만 들을 수 있어요</p>
          </div>
        </div>
      )}
    </div>
  )
}
