import { useEffect, useMemo, useRef, useState } from 'react'
import FlowerBloom3D from './FlowerBloom3D.jsx'
import { Sprout, Trash } from './Icons.jsx'
import { audioUrl } from '../lib/db.js'
import { audioCtx, peaks, playStereo, setPlaybackLevelSource, toMono } from '../lib/audio.js'

// <audio> 재생 중 음량: 오디오를 Web Audio로 다시 연결하면 signed URL(다른 출처)에서 소리가
// 묵음이 될 수 있어서, 저장된 파형 윤곽(lengths)을 재생 위치에 맞춰 읽는다.
function envelopeLevel(el, flower) {
  const env = flower.lengths?.length ? flower.lengths : [0.8]
  return () => {
    if (!el || el.paused || !el.duration) return 0
    const i = Math.min(env.length - 1, Math.floor((el.currentTime / el.duration) * env.length))
    return (env[i] - 0.5) * 2 * (0.6 + 0.4 * Math.abs(Math.sin(el.currentTime * 9)))
  }
}
import { displayName, isTree, noun } from '../lib/tree.js'

// S5 꽃 상세
export function FlowerDetail({ flower, sender, mine, sharedWith = [], onShare, onAccept, onDecline, onGardenToggle, onDeleteReceived, answerBusy, onClose, onDelete }) {
  const [url, setUrl] = useState(null)
  const [confirm, setConfirm] = useState(false)
  const audioRef = useRef(null)
  const flowerWord = flower.transcript?.trim() || (isTree(flower) ? flower.root : '')
  const planted = flower.share_status === 'accepted'

  // 닫히면 정원 빛 알갱이 반응도 멈춘다
  useEffect(() => () => setPlaybackLevelSource(null), [])

  useEffect(() => {
    audioUrl(flower.audio_path).then((u) => {
      setUrl(u)
      setTimeout(() => audioRef.current?.play().catch(() => {}), 50)
    }).catch(console.error)
  }, [flower.audio_path])

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet center-col" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="닫기">×</button>
        <FlowerBloom3D flower={flower} size={160} />
        <h2 className="flower-name">{displayName(flower)}</h2>
        <p className="reason">{flower.reason}</p>
        {flowerWord && <p className="hanamal-view">{flowerWord}</p>}
        <p className="muted small">
          {mine ? `내가 보낸 ${noun(flower)}` : `${sender?.nickname || '상대'}가 보낸 ${noun(flower)}`} · {flower.sent_date}
        </p>
        {url ? <audio
          ref={audioRef} src={url} controls className="preview-audio"
          onPlay={(e) => setPlaybackLevelSource(envelopeLevel(e.currentTarget, flower))}
          onPause={() => setPlaybackLevelSource(null)}
          onEnded={() => setPlaybackLevelSource(null)}
        /> : <p className="muted">소리를 불러오는 중…</p>}
        {onAccept && (
          <div className="row">
            {onDecline && <button className="ghost" disabled={answerBusy} onClick={onDecline}>괜찮아요</button>}
            <button className="primary" disabled={answerBusy} onClick={onAccept}>{answerBusy ? '심는 중…' : '정원에 심기'}</button>
          </div>
        )}
        {onGardenToggle && !confirm && (
          <div className="album-detail-actions">
            <button className={`${planted ? 'ghost' : 'primary'} album-garden-action`} disabled={answerBusy} onClick={onGardenToggle}>
              <Sprout width={18} height={18} aria-hidden="true" />
              {answerBusy ? '처리 중…' : planted ? '정원에서 빼기' : '정원에 심기'}
            </button>
            <button className="album-delete" disabled={answerBusy} onClick={() => setConfirm(true)} aria-label="앨범에서 삭제"><Trash width={17} height={17} aria-hidden="true" />삭제</button>
          </div>
        )}
        {mine && onShare && (
          <>
            <button className="primary" onClick={onShare}>친구에게 공유</button>
            {sharedWith.length > 0 && <p className="muted small">공유한 친구 · {sharedWith.join(', ')}</p>}
          </>
        )}
        {(mine || onDeleteReceived) && (
          confirm ? (
            <div className="album-delete-confirm">
              {onDeleteReceived && <p className="small muted">내 앨범과 정원에서 삭제할까요?<br />친구의 원본 소리는 남아 있어요.</p>}
              <div className="row">
              <button className="ghost" disabled={answerBusy} onClick={() => setConfirm(false)}>취소</button>
              <button className="danger" disabled={answerBusy} onClick={() => onDeleteReceived ? onDeleteReceived() : onDelete(flower)}>{answerBusy ? '삭제 중…' : '정말 삭제'}</button>
              </div>
            </div>
          ) : mine ? <button className="link danger-text" onClick={() => setConfirm(true)}>이 소리 지우기</button> : null
        )}
      </div>
    </div>
  )
}

// S6 우리의 꽃: 상대 소리는 왼쪽, 내 소리는 오른쪽
export function PairDetail({ pair, flowerA, flowerB, meId, members, onClose }) {
  const partnerFlower = flowerA.sender_id === meId ? flowerB : flowerA
  const myFlower = partnerFlower === flowerA ? flowerB : flowerA
  const [buffers, setBuffers] = useState(null)
  const [progress, setProgress] = useState(0)
  const [playing, setPlaying] = useState(false)
  const playRef = useRef(null)
  const rafRef = useRef(0)
  const nick = (id) => members.find((m) => m.id === id)?.nickname

  useEffect(() => {
    let alive = true
    Promise.all([partnerFlower, myFlower].map(async (f) => {
      const res = await fetch(await audioUrl(f.audio_path))
      return audioCtx().decodeAudioData(await res.arrayBuffer())
    })).then((b) => alive && setBuffers(b)).catch(console.error)
    return () => { alive = false; stop() }
  }, [pair.id])

  function play() {
    if (!buffers) return
    stop()
    setPlaying(true)
    const h = playStereo(buffers[0], buffers[1], () => { setPlaying(false); cancelAnimationFrame(rafRef.current); setProgress(0) })
    playRef.current = h
    const tick = () => {
      setProgress(Math.min(1, Math.max(0, (audioCtx().currentTime - h.startedAt) / h.duration)))
      rafRef.current = requestAnimationFrame(tick)
    }
    tick()
  }
  function stop() {
    cancelAnimationFrame(rafRef.current)
    playRef.current?.stop()
    playRef.current = null
  }

  const colors = [partnerFlower.color, myFlower.color]
  const look = { ...myFlower, petals: Math.min(8, Math.max(partnerFlower.petals, myFlower.petals) + 1) }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet center-col" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="닫기">×</button>
        <div className="pair-badge">우리의 꽃 · {pair.sent_date}</div>
        <FlowerBloom3D flower={look} colors={colors} pair size={170} />
        <h2 className="flower-name">{pair.name}</h2>
        <p className="muted small">{displayName(partnerFlower)} + {displayName(myFlower)}</p>
        <div className="stereo">
          <Wave label={`왼쪽 · ${nick(partnerFlower.sender_id) || '상대'}`} buffer={buffers?.[0]} duration={buffers && Math.max(buffers[0].duration, buffers[1].duration)} progress={progress} color={partnerFlower.color} />
          <Wave label={`오른쪽 · ${nick(myFlower.sender_id) || '나'}`} buffer={buffers?.[1]} duration={buffers && Math.max(buffers[0].duration, buffers[1].duration)} progress={progress} color={myFlower.color} />
        </div>
        <p className="muted small">🎧 이어폰을 끼면 두 소리가 양쪽 귀로 나뉘어 들려요.</p>
        <button className="primary" onClick={playing ? stop : play} disabled={!buffers}>
          {!buffers ? '불러오는 중…' : playing ? '멈추기' : '함께 듣기'}
        </button>
      </div>
    </div>
  )
}

function Wave({ label, buffer, duration, progress, color }) {
  const n = 80
  const p = useMemo(() => (buffer ? peaks(toMono(buffer), n) : null), [buffer])
  if (!buffer) return <div className="wave-box"><span>{label}</span><div className="wave-empty" /></div>
  const widthFrac = buffer.duration / duration
  return (
    <div className="wave-box">
      <span>{label}</span>
      <svg viewBox={`0 0 ${n} 40`} preserveAspectRatio="none">
        {p.map((v, i) => {
          const x = i * widthFrac
          const on = x / n <= progress
          return <rect key={i} x={x + 0.1} width={Math.max(0.3, widthFrac * 0.7)} y={20 - v * 18} height={Math.max(1, v * 36)} rx="0.3" fill={on ? color : '#d9d4c6'} />
        })}
        <line x1={progress * n} x2={progress * n} y1="0" y2="40" stroke="#333" strokeWidth="0.3" />
      </svg>
    </div>
  )
}
