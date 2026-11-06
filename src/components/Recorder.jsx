import { useEffect, useRef, useState } from 'react'
import Flower from './Flower.jsx'
import { decodeBlob, extractFeatures, pickMimeType, resample, toMono, audioCtx } from '../lib/audio.js'
import { classify } from '../lib/classify.js'
import { startLiveTranscript, canDictate, dictateOnce } from '../lib/stt.js'
import { CATEGORIES, VOICE_CATEGORIES, makeName, flowerLook } from '../lib/naming.js'

const MAX_SEC = 10

// S3 녹음 → (분류 애매하면 카테고리 선택) → S4 꽃 미리보기
export default function Recorder({ onClose, onSend }) {
  const [step, setStep] = useState('idle') // idle | recording | analyzing | choose | preview | sending
  const [left, setLeft] = useState(MAX_SEC)
  const [blob, setBlob] = useState(null)
  const [blobUrl, setBlobUrl] = useState(null)
  const [features, setFeatures] = useState(null)
  const [classResult, setClassResult] = useState(null)
  const [category, setCategory] = useState(null)
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
    try { sttRef.current?.stop() } catch {}
  }

  async function start() {
    setError('')
    setBlob(null); setFeatures(null); setClassResult(null); setCategory(null); setTranscript('')
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
    } catch {
      setError('마이크를 쓸 수 없어요. 브라우저 권한과 https 접속을 확인해 주세요.')
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
      const u = URL.createObjectURL(b)
      setBlobUrl(u)
      analyze(b)
      // 미리 듣기 자동 재생
      setTimeout(() => audioRef.current?.play().catch(() => {}), 50)
    }
    recRef.current = rec
    rec.start()
    startSTT()
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

  function startSTT() {
    sttRef.current = startLiveTranscript()
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

  function drawLive(stream) {
    const ctx = audioCtx()
    const src = ctx.createMediaStreamSource(stream)
    const an = ctx.createAnalyser()
    an.fftSize = 2048
    src.connect(an)
    const data = new Uint8Array(an.fftSize)
    const loop = () => {
      const c = canvasRef.current
      if (c) {
        const g = c.getContext('2d')
        const { width: w, height: h } = c
        an.getByteTimeDomainData(data)
        g.clearRect(0, 0, w, h)
        g.lineWidth = 3
        g.strokeStyle = '#5c8a4a'
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
      const buf = await decodeBlob(b)
      const mono = toMono(buf)
      const f = extractFeatures(mono, buf.sampleRate)
      setFeatures(f)
      // STT는 녹음이 끝난 뒤 조금 더 결과가 들어올 수 있음
      setTimeout(() => setTranscript((t) => t || sttRef.current?.text || ''), 600)
      const samples16k = await resample(buf, 16000)
      const r = await classify(samples16k, 3000)
      setClassResult(r)
      if (r?.category) { setCategory(r.category); setStep('preview') }
      else setStep('choose')
    } catch (e) {
      console.error(e)
      setError('소리를 분석하지 못했어요. 다시 녹음해 주세요.')
      setStep('idle')
    }
  }

  const named = category && features ? makeName(category, features) : null
  const look = named ? flowerLook(category, features, named.axes) : null
  const preview = named && {
    ...look,
    vowel: named.axes.vowel,
    consonant: named.axes.consonant,
    rms: features.rms,
  }
  const isVoice = VOICE_CATEGORIES.includes(category)

  async function send() {
    setStep('sending')
    try {
      await onSend({
        blob,
        category,
        root: named.root,
        name: named.name,
        reason: named.reason,
        transcript: isVoice && transcript.trim() ? transcript.trim() : null,
        rms: features.rms,
        centroid: features.centroid,
        attack: features.attack,
        onsets: features.onsets,
        vowel: named.axes.vowel,
        consonant: named.axes.consonant,
        color: look.color,
        petals: look.petals,
      })
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
            <h2>오늘의 소리</h2>
            <p className="muted">지금 들리는 소리를 10초까지 담아 보세요.</p>
            <canvas ref={canvasRef} className="wave" width="600" height="140" />
            <div className="timer">{step === 'recording' ? `${left.toFixed(1)}초 남음` : '최대 10초'}</div>
            {step === 'idle' ? (
              <button className="rec-btn" onClick={start} aria-label="녹음 시작"><span /></button>
            ) : (
              <button className="rec-btn recording" onClick={stop} aria-label="녹음 멈추기"><span /></button>
            )}
          </>
        )}

        {step === 'analyzing' && (
          <div className="center-col">
            <div className="seed" />
            <p>어떤 소리인지 듣고 있어요…</p>
          </div>
        )}

        {step === 'choose' && (
          <>
            <h2>어떤 소리였나요?</h2>
            <p className="muted">
              {classResult ? '소리를 확실히 알아듣지 못했어요.' : '분류 모델을 쓸 수 없어 직접 골라 주세요.'}
              {classResult?.top && <><br /><small>들린 것: {classResult.top.join(', ')}</small></>}
            </p>
            <CategoryGrid suggestion={classResult?.suggestion} onPick={(c) => { setCategory(c); setStep('preview') }} />
          </>
        )}

        {(step === 'preview' || step === 'sending') && named && (
          <div className="center-col">
            <Flower flower={preview} size={140} />
            <h2 className="flower-name">{named.name}</h2>
            <p className="reason">{named.reason}</p>
            <button className="link" onClick={() => setStep('choose')}>
              {CATEGORIES[category].label} 소리가 아니에요
            </button>
            {isVoice && (
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

function CategoryGrid({ suggestion, onPick }) {
  return (
    <div className="cat-grid">
      {Object.entries(CATEGORIES).map(([id, c]) => (
        <button key={id} className={id === suggestion ? 'suggested' : ''} onClick={() => onPick(id)}>
          <b>{c.label}</b>
          <small>{c.root}</small>
        </button>
      ))}
    </div>
  )
}
