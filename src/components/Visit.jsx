import { useEffect, useState } from 'react'
import Island3D from './Island3D.jsx'
import { FlowerDetail } from './Details.jsx'
import { loadVisit } from '../lib/db.js'
import { isTree } from '../lib/tree.js'

// 친구의 공개 정원에 놀러 가기 (보기·듣기만). 친구가 직접 심은 소리만 보인다.
export default function Visit({ friend, onClose }) {
  const [flowers, setFlowers] = useState(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(null)

  useEffect(() => {
    loadVisit(friend)
      .then(setFlowers)
      .catch((e) => setError(e.message || String(e)))
  }, [friend.garden_id])

  const trees = flowers?.filter(isTree).length ?? 0
  const blooms = (flowers?.length ?? 0) - trees

  return (
    <div className="home sheet-closed visit">
      <div className="sky">
        <div className="cloud c1" /><div className="cloud c2" /><div className="cloud c3" />
      </div>
      {flowers && (
        <div className="island-touch">
          {/* 친구 입장에서 본 정원: 친구가 심은 소리가 오른쪽 */}
          <Island3D flowers={flowers} pairs={[]} meId={friend.member_id} onPickFlower={setOpen} onPickPair={() => {}} />
        </div>
      )}
      <div className="home-title">
        <span className="wordmark">놀러 왔어요</span>
        <h1>{friend.nickname}의 정원</h1>
        {flowers && <p className="visit-sub">꽃 {blooms}송이 · 나무 {trees}그루 · 눌러서 들어 보세요</p>}
      </div>
      {!flowers && !error && <div className="empty-garden"><b>정원으로 가는 중…</b></div>}
      {flowers && flowers.length === 0 && <div className="empty-garden"><b>아직 심은 소리가 없는 정원이에요</b></div>}
      {error && <div className="empty-garden"><b>정원에 들어가지 못했어요</b><small>{error}</small></div>}
      <button className="ghost visit-back" onClick={onClose}>← 내 정원으로</button>
      {open && (
        <FlowerDetail flower={open} sender={{ nickname: friend.nickname }} mine={false} onClose={() => setOpen(null)} />
      )}
    </div>
  )
}
