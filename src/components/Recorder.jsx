import { useEffect, useRef, useState } from 'react'
import Flower from './Flower.jsx'
import { pickMimeType, audioCtx } from '../lib/audio.js'
import { extractFeatures } from '../lib/soundFeatures.js'
import { CATEGORIES, buildFlower, buildSoundFlower, voiceCategory } from '../lib/flower.js'
import { analyzeEmotion, emotionEnabled } from '../lib/emotion.js'
import { toFlowerRow } from '../lib/naming.js'
import { startLiveTranscript, canDictate, dictateOnce } from '../lib/stt.js'

const MAX_SEC = 10

// S3 녹음 → S4 꽃 미리보기
// 녹음 전에 '사람 목소리 / 다른 소리'를 고른다.
//  - 목소리: 감정 분석 서버 결과로 감정 꽃을 고르고, STT 문장을 꽃말로 붙인다. 서버가 안 되면 감정을 직접 고른다.
//  - 다른 소리: 분류하지 않고 크기·밝기·세기·리듬·파형으로 바로 꽃을 만든다.
export default function Recorder({ onClose, onSend }) {
  const [kind, setKind] = useState('') // 'voice' | 'other'
  const [step, setStep] = useState('idle') // idle | recording | analyzing | choose | preview | sending
  const [left, setLeft] = useState(MAX_SEC)
  const [blob, setBlob] = useState(null)
  const [blobUrl, setBlobUrl] = useState(null)
  const [features, setFeatures] = useState(null)
  const [emotion, setEmotion] = useState(null)
  const [emotionError, setEmotionError] = useState('')
  const [category, setCategory] = useState('')
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState('')
  const [dictating, setDictating] = useState(false)

  const canvasRef = useRef(null)
  const recRef = useRef(null)
  const streamRef = useRef(null)
  const rafRef = useRef(0)
  const timerRef = useRef(0)
  const sttRef = useRef(null)
  const audioRef = useRef(null)

  useEffect(() => () => cleanup(), [])
  useEffect(() => () => blobUrl && URL.revokeObjectURL(blobUrl), [blobUrl])

  function cleanup() {
    cancelAnimationFrame(rafRef.current)
    clearInterval(timerRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    sttRef.current?.stop()
  }

  async function start() {
    setError(''); setEmotionError('')
    setBlob(null); setFeatures(null); setEmotion(null); setCategory(''); setTranscript('')
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
    } catch {
      setError('마이크를 쓸 수 없어요. 마이크 권한과 https 접속을 확인해 주세요.')
      return
    }
    streamRef.current = stream
    const mimeType = pickMimeType()
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    const chunks = []
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    rec.onstop = () => {
      cleanup()
      const b = new Blob(chunks, { type: rec.mimeType || mimeType || 'audio/webm' })
      setBlob(b)
      setBlobUrl(URL.createObjectURL(b))
      analyze(b)
      setTimeout(() => audioRef.current?.play().catch(() => {}), 50) // 미리 듣기 자동 재생
    }
    recRef.current = rec
    rec.start()
    sttRef.current = kind === 'voice' ? startLiveTranscript() : null
    drawLive(stream)
    const t0 = Date.now()
    setLeft(MAX_SEC)
    timerRef.current = setInterval(() => {
      const remain = MAX_SEC - (Date.now() - t0) / 1000
      setLeft(Math.max(0, remain))
      if (remain <= 0) stop()
    }, 100)
    setStep('recording')
  }

  function stop() {
    clearInterval(timerRef.current)
    if (recRef.current?.state === 'recording') recRef.current.stop()
  }

  function drawLive(stream) {
    const ctx = audioCtx()
    const an = ctx.createAnalyser()
    an.fftSize = 2048
    ctx.createMediaStreamSource(stream).connect(an)
    const data = new Uint8Array(an.fftSize)
    const loop = () => {
      const c = canvasRef.current
      if (c) {
        const g = c.getContext('2d')
        const { width: w, height: h } = c
        an.getByteTimeDomainData(data)
        g.clearRect(0, 0, w, h)
        g.lineWidth = 3
        g.strokeStyle = '#c4573a'
        g.beginPath()
        for (let i = 0; i < data.length; i += 8) {
          const x = (i / data.length) * w
          const y = (data[i] / 255) * h
          i ? g.lineTo(x, y) : g.moveTo(x, y)
        }
        g.stroke()
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    loop()
  }

  async function analyze(b) {
    setStep('analyzing')
    try {
      const f = await extractFeatures(b)
      setFeatures(f)
      if (kind === 'other') { setStep('preview'); return }

      setTimeout(() => setTranscript((t) => t || sttRef.current?.text || ''), 600)
      if (!emotionEnabled) {
        setEmotionError('감정 분석 서버 주소(VITE_EMOTION_API_URL)가 설정되지 않았어요.')
        setStep('choose')
        return
      }
      try {
        const r = await analyzeEmotion(b)
        setEmotion(r)
        setCategory(voiceCategory(r, f))
        setStep('preview')
      } catch (e) {
        setEmotionError(`${e.message || e} — 감정 분석 서버가 켜져 있는지 확인해 주세요.`)
        setStep('choose')
      }
    } catch (e) {
      console.error(e)
      setError('소리를 분석하지 못했어요. 다시 녹음해 주세요.')
      setStep('idle')
    }
  }

  async function dictate() {
    setDictating(true); setError('')
    try {
      const t = await dictateOnce()
      if (t) setTranscript(t)
    } catch (e) {
      setError(e.message || String(e))
    } finally { setDictating(false) }
  }

  let flower = null
  if (features && kind === 'other') flower = buildSoundFlower(features)
  else if (features && kind === 'voice' && category) flower = buildFlower(category, features, emotion?.intensity)
  const row = flower && toFlowerRow({ flower, features, kind, category, transcript: kind === 'voice' ? transcript.trim() : null })

  async function send() {
    setStep('sending')
    try {
      await onSend({ blob, ...row })
    } catch (e) {
      console.error(e)
      setError(`보내지 못했어요: ${e.message || e}`)
      setStep('preview')
    }
  }

  return (
    <div className="sheet-backdrop">
      <div className="sheet recorder">
        <button className="close" onClick={() => { cleanup(); onClose() }} aria-label="닫기">×</button>

        {(step === 'idle' || step === 'recording') && (
          <>
            <h2 className="sheet-title">오늘의 소리</h2>
            <p className="muted">어떤 소리를 남길까요?</p>
            <div className="kind-toggle">
              {[['voice', '사람 목소리'], ['other', '다른 소리']].map(([id, label]) => (
                <button key={id} className={kind === id ? 'on' : ''} onClick={() => setKind(id)} disabled={step === 'recording'}>
                  {label}
                </button>
              ))}
            </div>
            <canvas ref={canvasRef} className="wave" width="600" height="140" />
            <div className="timer">
              {step === 'recording' ? `${left.toFixed(1)}초 남음` : kind ? '최대 10초' : '먼저 소리 종류를 골라 주세요'}
            </div>
            {step === 'idle' ? (
              <button className="rec-btn" onClick={start} disabled={!kind} aria-label="녹음 시작"><span /></button>
            ) : (
              <button className="rec-btn recording" onClick={stop} aria-label="녹음 멈추기"><span /></button>
            )}
          </>
        )}

        {step === 'analyzing' && (
          <div className="center-col">
            <div className="seed" />
            <p>{kind === 'voice' ? '목소리의 감정을 읽고 있어요…' : '소리의 모양을 살피고 있어요…'}</p>
          </div>
        )}

        {step === 'choose' && (
          <>
            <h2 className="sheet-title">어떤 마음이 담긴 목소리인가요?</h2>
            {emotionError && <p className="muted small">{emotionError}</p>}
            <div className="cat-grid">
              {CATEGORIES.map((c) => (
                <button key={c.id} className={c.id === category ? 'suggested' : ''} onClick={() => { setCategory(c.id); setStep('preview') }}>
                  <b>{c.label}</b>
                  <small>{c.base}</small>
                </button>
              ))}
            </div>
          </>
        )}

        {(step === 'preview' || step === 'sending') && flower && (
          <div className="center-col">
            <Flower flower={row} size={140} />
            <h2 className="flower-name">{flower.name}</h2>
            <p className="reason">{flower.reason}</p>
            {kind === 'voice' && (
              <>
                {emotion && (
                  <p className="muted small">
                    읽은 감정: {emotion.emotion} · 강도 {Number(emotion.intensity).toFixed(2)}
                  </p>
                )}
                <button className="link" onClick={() => setStep('choose')}>다른 마음이었어요</button>
                <label className="hanamal">
                  꽃말
                  <textarea
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    placeholder="들린 말을 적어 두세요 (비워도 괜찮아요)"
                    rows={2}
                  />
                  {canDictate && (
                    <button className="ghost small-btn" onClick={dictate} disabled={dictating}>
                      {dictating ? '듣고 있어요… 꽃말을 말해 주세요' : '🎙 말로 적기'}
                    </button>
                  )}
                </label>
              </>
            )}
            <div className="row">
              <button className="ghost" onClick={() => setStep('idle')} disabled={step === 'sending'}>다시 녹음</button>
              <button className="primary" onClick={send} disabled={step === 'sending'}>
                {step === 'sending' ? '보내는 중…' : '보내기'}
              </button>
            </div>
          </div>
        )}

        {blobUrl && step !== 'idle' && step !== 'recording' && (
          <audio ref={audioRef} src={blobUrl} controls className="preview-audio" />
        )}
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  )
}
