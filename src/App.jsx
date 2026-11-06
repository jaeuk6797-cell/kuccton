import { useEffect, useRef, useState } from 'react'
import { useSpeechRecognition } from './useSpeechRecognition.js'
import { analyzeEmotion, emotionEnabled } from './emotion.js'
import { extractFeatures } from './soundFeatures.js'
import { CATEGORIES, VOICE_IDS, buildFlower } from './flower.js'
import Flower from './Flower.jsx'

const MAX_SECONDS = 10

export default function App() {
  const stt = useSpeechRecognition()
  const [recording, setRecording] = useState(false)
  const [left, setLeft] = useState(MAX_SECONDS)
  const [blob, setBlob] = useState(null)
  const [audioUrl, setAudioUrl] = useState(null)
  const [micError, setMicError] = useState(null)
  const [category, setCategory] = useState('')
  const [emotion, setEmotion] = useState(null)
  const [emotionError, setEmotionError] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [features, setFeatures] = useState(null)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)

  useEffect(() => () => clearInterval(timerRef.current), [])

  useEffect(() => {
    setFeatures(null)
    if (!blob) return
    let cancelled = false
    extractFeatures(blob)
      .then((f) => !cancelled && setFeatures(f))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [blob])

  // 사람 목소리를 골랐을 때만 녹음을 감정 분석 서버로 보낸다.
  useEffect(() => {
    setEmotion(null)
    setEmotionError(null)
    if (!VOICE_IDS.includes(category) || !blob || !emotionEnabled) return
    let cancelled = false
    setAnalyzing(true)
    analyzeEmotion(blob)
      .then((r) => !cancelled && setEmotion(r))
      .catch((e) => !cancelled && setEmotionError(e.message))
      .finally(() => !cancelled && setAnalyzing(false))
    return () => {
      cancelled = true
    }
  }, [category, blob])

  async function startRecording() {
    setMicError(null)
    setBlob(null)
    setAudioUrl(null)
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setMicError('마이크 권한이 필요해요 (HTTPS 또는 localhost에서만 동작)')
      return
    }

    chunksRef.current = []
    const recorder = new MediaRecorder(stream)
    recorder.ondataavailable = (e) => chunksRef.current.push(e.data)
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop())
      const recorded = new Blob(chunksRef.current, { type: recorder.mimeType })
      setBlob(recorded)
      setAudioUrl(URL.createObjectURL(recorded))
    }
    recorderRef.current = recorder
    recorder.start()
    stt.start()

    setRecording(true)
    setLeft(MAX_SECONDS)
    const startedAt = Date.now()
    timerRef.current = setInterval(() => {
      const remain = MAX_SECONDS - Math.floor((Date.now() - startedAt) / 1000)
      setLeft(Math.max(remain, 0))
      if (remain <= 0) stopRecording()
    }, 200)
  }

  function stopRecording() {
    clearInterval(timerRef.current)
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    stt.stop()
    setRecording(false)
  }

  const flower = features && category ? buildFlower(category, features) : null
  const flowerWord = stt.transcript + (stt.interim ? ` ${stt.interim}` : '')

  return (
    <main style={{ maxWidth: 420, margin: '0 auto', padding: 24, fontFamily: 'sans-serif' }}>
      <h1>소리숲</h1>

      <button onClick={recording ? stopRecording : startRecording} style={{ fontSize: 18, padding: '12px 20px' }}>
        {recording ? `■ 멈추기 (${left}초)` : '● 10초 녹음'}
      </button>
      {micError && <p style={{ color: 'crimson' }}>{micError}</p>}

      {audioUrl && (
        <div style={{ marginTop: 16 }}>
          <audio src={audioUrl} controls />
        </div>
      )}

      {blob && (
        <section style={{ marginTop: 24 }}>
          <h2>어떤 소리인가요?</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                style={{ fontWeight: category === c.id ? 'bold' : 'normal' }}
              >
                {c.label}
              </button>
            ))}
          </div>

          {VOICE_IDS.includes(category) && (
            <div style={{ marginTop: 12 }}>
              {!emotionEnabled && <p>감정 분석 서버 주소(VITE_EMOTION_API_URL)가 설정되지 않았어요.</p>}
              {analyzing && <p>목소리의 감정을 읽는 중…</p>}
              {emotionError && <p style={{ color: 'crimson' }}>{emotionError}</p>}
              {emotion && (
                <p>
                  감정: <b>{emotion.emotion}</b> (강도 {emotion.intensity.toFixed(2)})
                </p>
              )}
            </div>
          )}

          {flower && (
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <Flower flower={flower} />
              <h3 style={{ margin: 0 }}>{flower.name}</h3>
              <p style={{ margin: '4px 0' }}>{flower.reason}</p>
            </div>
          )}
        </section>
      )}

      <section style={{ marginTop: 24 }}>
        <h2>꽃말</h2>
        {!stt.supported && <p>이 브라우저는 음성 인식을 지원하지 않아요. 직접 입력해 주세요.</p>}
        {stt.error && <p style={{ color: 'crimson' }}>음성 인식 오류: {stt.error}</p>}
        <textarea
          rows={3}
          style={{ width: '100%' }}
          placeholder="목소리가 있으면 여기에 받아 적혀요"
          value={recording ? flowerWord : stt.transcript}
          readOnly={recording}
          onChange={(e) => stt.setTranscript(e.target.value)}
        />
        <button onClick={() => stt.setTranscript('')} disabled={recording || !stt.transcript}>
          꽃말 지우기
        </button>
      </section>
    </main>
  )
}
