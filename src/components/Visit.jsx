import { useEffect, useState } from 'react'
import Island3D from './Island3D.jsx'
import { loadVisit } from '../lib/db.js'
import { isTree } from '../lib/tree.js'

// 친구 정원에 놀러 가기: 친구면 언제든 갈 수 있지만 정원 모양만 구경한다.
// 꽃·나무를 눌러도 반응하지 않고, 소리는 들을 수 없다.
// (DB에서도 방문할 때는 소리 파일 경로와 꽃말을 내려주지 않는다 — migrations-008.sql)
// 친구 정원 = 그 친구가 받아서 심은 소리들
export default function Visit({ friend, onClose }) {
  const [flowers, setFlowers] = useState(null)
  const [error, setError] = useState('')

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
          {/* 고르기 없음: onPickFlower를 넘기지 않으면 눌러도 아무 일도 일어나지 않는다 */}
          <Island3D flowers={flowers} pairs={[]} meId={friend.member_id} />
        </div>
      )}
      <div className="home-title">
        <span className="wordmark">놀러 왔어요</span>
        <h1>{friend.nickname}의 정원</h1>
        {flowers && <p className="visit-sub">꽃 {blooms}송이 · 나무 {trees}그루 · 드래그로 둘러보기</p>}
      </div>
      {!flowers && !error && <div className="empty-garden"><b>정원으로 가는 중…</b></div>}
      {flowers && flowers.length === 0 && <div className="empty-garden"><b>아직 심은 소리가 없는 정원이에요</b></div>}
      {error && <div className="empty-garden"><b>정원에 들어가지 못했어요</b><small>{error}</small></div>}
      <button className="ghost visit-back" onClick={onClose}>← 내 정원으로</button>
    </div>
  )
}
