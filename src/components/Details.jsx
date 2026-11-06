import { useEffect, useState } from 'react'
import FlowerBloom3D from './FlowerBloom3D.jsx'
import SoundPlayer from './SoundPlayer.jsx'
import { Sprout, Trash } from './Icons.jsx'
import { audioUrl } from '../lib/db.js'
import { audioCtx } from '../lib/audio.js'
import { stereoWave } from '../lib/audioLevel.js'
import { displayName, isTree, noun } from '../lib/tree.js'

// S5 꽃 상세
export function FlowerDetail({ flower, bloom = true, sender, mine, sharedWith = [], onShare, onAccept, onDecline, onGardenToggle, onDeleteReceived, answerBusy, onClose, onDelete }) {
  const [url, setUrl] = useState(null)
  const [confirm, setConfirm] = useState(false)
  const [audioError, setAudioError] = useState('')
  const flowerWord = flower.transcript?.trim() || (isTree(flower) ? flower.root : '')
  const planted = flower.share_status === 'accepted'

  useEffect(() => {
    let active = true
    setUrl(null); setAudioError('')
    if (!flower.audio_path) { setAudioError('재생할 소리가 없어요.'); return }
    audioUrl(flower.audio_path).then((value) => { if (active) setUrl(value) })
      .catch(() => { if (active) setAudioError('소리를 불러오지 못했어요. 다시 열어 주세요.') })
    return () => { active = false }
  }, [flower.audio_path])

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet center-col" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="닫기">×</button>
        <FlowerBloom3D flower={flower} bloom={bloom} size={160} />
        <h2 className="flower-name">{displayName(flower)}</h2>
        <p className="reason">{flower.reason}</p>
        {flowerWord && <p className="hanamal-view">{flowerWord}</p>}
        <p className="muted small">
          {mine ? `내가 보낸 ${noun(flower)}` : `${sender?.nickname || '상대'}가 보낸 ${noun(flower)}`} · {flower.sent_date}
        </p>
        {url ? <SoundPlayer src={url} label={displayName(flower)} autoPlay flower={flower} />
          : <p className="muted small" role="status">{audioError || '소리를 불러오는 중…'}</p>}
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

// 우리의 꽃은 하나의 스테레오 WAV로 재생해 iOS에서도 같은 시점에 시작한다.
export function PairDetail({ pair, bloom = true, flowerA, flowerB, meId, members, onClose }) {
  const partnerFlower = flowerA.sender_id === meId ? flowerB : flowerA
  const myFlower = partnerFlower === flowerA ? flowerB : flowerA
  const [source, setSource] = useState(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const nick = (id) => members.find((m) => m.id === id)?.nickname

  useEffect(() => {
    let active = true, objectUrl
    const controller = new AbortController()
    setSource(null); setError('')
    ;(async () => {
      const encoded = await Promise.all([partnerFlower, myFlower].map(async (flower) => {
        if (!flower.audio_path) throw new Error('NO_AUDIO')
        const response = await fetch(await audioUrl(flower.audio_path), { signal: controller.signal })
        if (!response.ok) throw new Error('AUDIO_DOWNLOAD_FAILED')
        return response.arrayBuffer()
      }))
      // 디코딩에는 재생용 AudioContext를 깨우지 않아도 되는 오프라인 컨텍스트를 쓴다.
      const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext
      const decoder = Offline ? new Offline(2, 1, 44100) : audioCtx()
      const buffers = await Promise.all(encoded.map((data) => decoder.decodeAudioData(data)))
      if (!active) return
      objectUrl = URL.createObjectURL(stereoWave(buffers[0], buffers[1]))
      setSource({ url: objectUrl, duration: Math.max(...buffers.map((buffer) => buffer.duration)) })
    })().catch(() => { if (active) setError('소리를 준비하지 못했어요. 다시 시도해 주세요.') })
    return () => { active = false; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [pair.id, partnerFlower.audio_path, myFlower.audio_path, attempt])

  const colors = [partnerFlower.color, myFlower.color]
  const look = { ...myFlower, petals: Math.min(8, Math.max(partnerFlower.petals, myFlower.petals) + 1) }
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet center-col" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="닫기">×</button>
        <div className="pair-badge">우리의 꽃 · {pair.sent_date}</div>
        <FlowerBloom3D flower={look} colors={colors} pair bloom={bloom} size={170} />
        <h2 className="flower-name">{pair.name}</h2>
        <p className="muted small">{displayName(partnerFlower)} + {displayName(myFlower)}</p>
        <div className="stereo-labels">
          <span>왼쪽 · {nick(partnerFlower.sender_id) || '상대'}</span>
          <span>오른쪽 · {nick(myFlower.sender_id) || '나'}</span>
        </div>
        {source ? <SoundPlayer src={source.url} label="우리의 꽃" durationHint={source.duration} flower={look} />
          : error ? <><p className="muted small" role="status">{error}</p><button className="ghost" onClick={() => setAttempt((n) => n + 1)}>다시 시도</button></>
            : <p className="muted small" role="status">소리를 준비하는 중…</p>}
        <p className="muted small">이어폰을 끼면 두 소리가 양쪽 귀로 나뉘어 들려요.</p>
      </div>
    </div>
  )
}
