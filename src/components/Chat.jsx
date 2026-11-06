import { useEffect, useRef, useState } from 'react'
import Flower from './Flower.jsx'
import { currentUser, loadChat, sendMessage, subscribeChat } from '../lib/db.js'
import { displayName } from '../lib/tree.js'

// 친구와 대화하기. 메시지와 서로 보낸 소리가 시간순으로 함께 나온다(소리를 공유하면 자동으로 대화에 남는다).
// 받은 소리는 여기서 바로 듣고 심거나 거절할 수 있다.
export default function Chat({ friend, refreshKey, onBack, onOpenFlower, onAnswer, onShare }) {
  const [items, setItems] = useState(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const listRef = useRef(null)

  const reload = () => loadChat(friend.user_id).then(setItems).catch((e) => setError(e.message || String(e)))

  useEffect(() => { reload() }, [friend.user_id, refreshKey])
  useEffect(() => {
    let unsub = () => {}, alive = true
    currentUser().then((u) => { if (alive && u) unsub = subscribeChat(u.id, reload) })
    return () => { alive = false; unsub() }
  }, [friend.user_id])
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [items?.length])

  async function send(e) {
    e.preventDefault()
    const body = text.trim()
    if (!body) return
    setSending(true); setError('')
    try {
      await sendMessage(friend.user_id, body)
      setText('')
      await reload()
    } catch (err) {
      setError(err.message || String(err))
    } finally { setSending(false) }
  }

  const day = (iso) => new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
  const time = (iso) => new Date(iso).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })

  const soundStatus = (it) => {
    if (it.mine) return { pending: '친구가 고르는 중', accepted: '친구 정원에 심겼어요', declined: '친구가 받지 않았어요' }[it.status]
    return { accepted: '내 정원에 심었어요', declined: '받지 않았어요' }[it.status]
  }

  return (
    <div className="page chat">
      <header className="chat-head">
        <button className="link" onClick={onBack}>← 뒤로</button>
        <div className="chat-who">
          <span className="av partner">{[...friend.nickname][0]}</span>
          <b>{friend.nickname}</b>
        </div>
        <button className="ghost small-btn" onClick={onShare}>소리 보내기</button>
      </header>

      <div className="chat-list" ref={listRef}>
        {items === null && !error && <p className="muted center">대화를 불러오는 중…</p>}
        {items?.length === 0 && <p className="muted center">아직 나눈 이야기가 없어요. 먼저 인사해 보세요.</p>}
        {items?.map((it, i) => {
          const showDay = i === 0 || day(items[i - 1].created_at) !== day(it.created_at)
          return (
            <div key={it.id}>
              {showDay && <div className="chat-day">{day(it.created_at)}</div>}
              <div className={`chat-row ${it.mine ? 'mine' : 'theirs'}`}>
                {it.type === 'text' ? (
                  <div className="bubble">{it.body}</div>
                ) : (
                  <div className="bubble sound">
                    <button className="sound-card" onClick={() => onOpenFlower(it.flower)}>
                      <Flower flower={it.flower} size={44} stem={false} bloom={false} />
                      <div>
                        <small>{it.mine ? '소리를 보냈어요' : '소리가 도착했어요'}</small>
                        <b>{displayName(it.flower)}</b>
                        <small className="play">▶ 눌러서 듣기</small>
                      </div>
                    </button>
                    {!it.mine && it.status === 'pending' ? (
                      <div className="sound-actions">
                        <button className="primary small-btn" onClick={() => onAnswer(it.flower, true)}>정원에 심기</button>
                        <button className="ghost small-btn" onClick={() => onAnswer(it.flower, false)}>괜찮아요</button>
                      </div>
                    ) : (
                      soundStatus(it) && <small className="sound-status">{soundStatus(it)}</small>
                    )}
                  </div>
                )}
                <time>{time(it.created_at)}</time>
              </div>
            </div>
          )
        })}
      </div>

      <form className="chat-input" onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={`${friend.nickname}에게 메시지`} maxLength={1000} />
        <button className="primary" disabled={sending || !text.trim()}>보내기</button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  )
}
