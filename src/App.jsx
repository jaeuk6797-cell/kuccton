import { useEffect, useRef, useState } from 'react'
import { useSpeechRecognition } from './useSpeechRecognition.js'
import { analyzeEmotion, emotionEnabled } from './emotion.js'
import { extractFeatures } from './soundFeatures.js'
import { CATEGORIES, categoriesFor, buildFlower, voiceCategory } from './flower.js'
import { CONFIDENT_SCORE, classifySound, preloadClassifier } from './classify.js'
import Flower from './Flower.jsx'
import Waveform from './Waveform.jsx'

const MAX_SECONDS = 10

export default function App() {
  const stt = useSpeechRecognition()
  const [recording, setRecording] = useState(false)
  const [left, setLeft] = useState(MAX_SECONDS)
  const [blob, setBlob] = useState(null)
  const [audioUrl, setAudioUrl] = useState(null)
  const [micError, setMicError] = useState(null)
  const [kind, setKind] = useState('') // 'voice' | 'other', 녹음 전에 고른다
  const [category, setCategory] = useState('')
  const [emotion, setEmotion] = useState(null)
  const [emotionError, setEmotionError] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [features, setFeatures] = useState(null)
  const [liveStream, setLiveStream] = useState(null)
  const [classifying, setClassifying] = useState(false)
  const [suggestion, setSuggestion] = useState(null) // { id, score, voiceLikely }
  const [classifyError, setClassifyError] = useState(null)
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

  // 종류를 바꾸면 카테고리를 비운다. 목소리는 감정 분석 결과로, 다른 소리는 분류 결과나 직접 선택으로 정한다.
  useEffect(() => {
    setCategory('')
  }, [kind])

  // 다른 소리를 골랐으면 어떤 소리인지 판별해 카테고리를 미리 골라 둔다. 확신이 낮으면 직접 고르게 한다.
  useEffect(() => {
    if (kind === 'other') preloadClassifier()
  }, [kind])

  useEffect(() => {
    setSuggestion(null)
    setClassifyError(null)
    if (kind !== 'other' || !blob) return
    let cancelled = false
    setClassifying(true)
    classifySound(blob)
      .then((ranked) => {
        if (cancelled) return
        const allowed = new Set(categoriesFor('other').map((c) => c.id))
        allowed.delete('other')
        const best = ranked.find((r) => allowed.has(r.id))
        const voiceLikely = !allowed.has(ranked[0].id) && ranked[0].score >= CONFIDENT_SCORE
        setSuggestion({ ...best, voiceLikely })
        if (best.score >= CONFIDENT_SCORE) setCategory(best.id)
      })
      .catch(() => !cancelled && setClassifyError('소리를 분류하지 못했어요. 직접 골라 주세요.'))
      .finally(() => !cancelled && setClassifying(false))
    return () => {
      cancelled = true
    }
  }, [kind, blob])

  // 사람 목소리를 골랐을 때만 녹음을 감정 분석 서버로 보낸다.
  useEffect(() => {
    setEmotion(null)
    setEmotionError(null)
    if (kind !== 'voice' || !blob || !emotionEnabled) return
    let cancelled = false
    setAnalyzing(true)
    analyzeEmotion(blob)
      .then((r) => !cancelled && setEmotion(r))
      .catch((e) => !cancelled && setEmotionError(e.message))
      .finally(() => !cancelled && setAnalyzing(false))
    return () => {
      cancelled = true
    }
  }, [kind, blob])

  async function startRecording() {
    setMicError(null)
    setBlob(null)
    setAudioUrl(null)
    setCategory('')
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
      setLiveStream(null)
      stream.getTracks().forEach((t) => t.stop())
      const recorded = new Blob(chunksRef.current, { type: recorder.mimeType })
      setBlob(recorded)
      setAudioUrl(URL.createObjectURL(recorded))
    }
    recorderRef.current = recorder
    recorder.start()
    setLiveStream(stream)
    if (kind === 'voice') stt.start()

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

  // 목소리는 감정 분석 결과로 카테고리를 정하고, 아래 버튼으로 직접 고르면 그쪽이 우선한다.
  const autoVoice = kind === 'voice' && emotion && features ? voiceCategory(emotion, features) : ''
  const activeCategory = category || autoVoice
  const flower = features && activeCategory
    ? buildFlower(activeCategory, features, kind === 'voice' ? emotion?.intensity : undefined)
    : null
  const flowerWord = stt.transcript + (stt.interim ? ` ${stt.interim}` : '')

  return (
    <main style={{ maxWidth: 420, margin: '0 auto', padding: 24, fontFamily: 'sans-serif' }}>
      <h1>소리숲</h1>

      <section style={{ marginBottom: 16 }}>
        <p style={{ margin: '0 0 8px' }}>어떤 소리를 남길까요?</p>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            ['voice', '사람 목소리'],
            ['other', '다른 소리'],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setKind(id)}
              disabled={recording}
              style={{ fontWeight: kind === id ? 'bold' : 'normal', padding: '8px 14px' }}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <button
        onClick={recording ? stopRecording : startRecording}
        disabled={!recording && !kind}
        style={{ fontSize: 18, padding: '12px 20px' }}
      >
        {recording ? `■ 멈추기 (${left}초)` : '● 10초 녹음'}
      </button>
      {!kind && !recording && <p style={{ margin: '8px 0 0' }}>먼저 소리 종류를 골라 주세요.</p>}
      {micError && <p style={{ color: 'crimson' }}>{micError}</p>}

      <div style={{ marginTop: 16, display: recording ? 'block' : 'none' }}>
        <Waveform stream={liveStream} />
      </div>

      {audioUrl && (
        <div style={{ marginTop: 16 }}>
          <audio src={audioUrl} controls />
        </div>
      )}

      {blob && (
        <section style={{ marginTop: 24 }}>
          <h2>{kind === 'voice' ? '어떤 감정인가요?' : '어떤 소리인가요?'}</h2>
          {kind === 'other' && (
            <div style={{ margin: '0 0 8px' }}>
              {classifying && <p>어떤 소리인지 듣는 중… (처음엔 모델을 받느라 몇 초 걸려요)</p>}
              {classifyError && <p style={{ color: 'crimson' }}>{classifyError}</p>}
              {suggestion && suggestion.score >= CONFIDENT_SCORE && (
                <p>
                  <b>{CATEGORIES.find((c) => c.id === suggestion.id)?.label}</b> 소리 같아요 (확신{' '}
                  {Math.round(suggestion.score * 100)}%). 아니면 아래에서 직접 골라 주세요.
                </p>
              )}
              {suggestion && suggestion.score < CONFIDENT_SCORE && <p>잘 모르겠어요. 직접 골라 주세요.</p>}
              {suggestion?.voiceLikely && (
                <p>사람 소리가 섞여 있어요. 위에서 '사람 목소리'를 고르면 감정도 읽어 줘요.</p>
              )}
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {categoriesFor(kind).map((c) => (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                style={{ fontWeight: activeCategory === c.id ? 'bold' : 'normal' }}
              >
                {c.label}
              </button>
            ))}
          </div>

          {kind === 'voice' && (
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
