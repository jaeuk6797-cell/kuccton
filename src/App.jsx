import { useEffect, useRef, useState } from 'react'
import GardenScene from './scene/GardenScene.jsx'
import FlowerPreview from './components/FlowerPreview.jsx'
import Waveform from './components/Waveform.jsx'
import { supabaseStatus } from './services/supabase.js'
import { MAX_SECONDS, startRecording } from './lib/recorder.js'
import { playFlower } from './lib/player.js'
import { extractFeatures } from './lib/soundFeatures.js'
import { CATEGORIES, buildFlower, buildSoundFlower, voiceCategory } from './lib/flowerNaming.js'
import { analyzeEmotion, emotionEnabled } from './lib/emotion.js'
import { toFlower } from './lib/toFlower.js'

const statusLabels = {
  unconfigured: '미설정',
  invalid: '설정 오류',
  configured: '설정됨',
}

export default function App() {
  const [kind, setKind] = useState('') // 'voice' | 'other', 녹음 전에 고른다
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [liveStream, setLiveStream] = useState(null)
  const [take, setTake] = useState(null) // { blob, url, transcript, features }
  const [word, setWord] = useState('') // 꽃말(수정 가능)
  const [override, setOverride] = useState('') // 사용자가 직접 고른 감정 카테고리
  const [emotion, setEmotion] = useState(null)
  const [emotionError, setEmotionError] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState(null)
  const [flowers, setFlowers] = useState([])
  const recorderRef = useRef(null)
  const audioUrls = useRef(new Map()) // 꽃 id → 재생 URL (저장 객체와 분리해 둔다)

  // 종류를 바꾸면 직접 고른 감정을 비운다.
  useEffect(() => setOverride(''), [kind])

  // 사람 목소리일 때만 녹음을 감정 분석 서버로 보낸다. 실패해도 꽃 생성에는 영향이 없다.
  useEffect(() => {
    setEmotion(null)
    setEmotionError(null)
    if (kind !== 'voice' || !take?.blob || !emotionEnabled) return
    let cancelled = false
    setAnalyzing(true)
    analyzeEmotion(take.blob)
      .then((r) => !cancelled && setEmotion(r))
      .catch((e) => !cancelled && setEmotionError(e.message))
      .finally(() => !cancelled && setAnalyzing(false))
    return () => {
      cancelled = true
    }
  }, [kind, take?.blob])

  async function toggleRecording() {
    if (recorderRef.current) {
      recorderRef.current.stop()
      return
    }
    setError(null)
    setTake(null)
    setWord('')
    setOverride('')
    let handle
    try {
      handle = await startRecording({ onTick: setElapsed, stt: kind === 'voice' })
    } catch {
      setError('마이크 권한이 필요해요 (HTTPS 또는 localhost에서만 동작)')
      return
    }
    recorderRef.current = handle
    setRecording(true)
    setLiveStream(handle.stream)

    const { blob, transcript } = await handle.done
    recorderRef.current = null
    setRecording(false)
    setLiveStream(null)
    setElapsed(0)

    const url = URL.createObjectURL(blob)
    setTake({ blob, url, transcript, features: null })
    setWord(transcript)
    try {
      const features = await extractFeatures(blob)
      setTake((t) => (t?.blob === blob ? { ...t, features } : t))
    } catch {
      setError('소리를 분석하지 못했어요. 다시 녹음해 주세요.')
    }
  }

  const features = take?.features
  // 목소리는 감정 분석 결과로 카테고리를 정하고, 버튼으로 직접 고르면 그쪽이 우선한다.
  // 사물 소리는 분류하지 않고 크기·밝기·세기·리듬·파형으로 바로 꽃을 만든다.
  const autoVoice = kind === 'voice' && emotion && features ? voiceCategory(emotion, features) : ''
  const category = override || autoVoice
  let preview = null
  if (features && kind === 'other') preview = buildSoundFlower(features)
  else if (features && kind === 'voice' && category) preview = buildFlower(category, features, emotion?.intensity)

  function plant() {
    try {
      const flower = toFlower({ result: preview, kind, features, transcript: word })
      audioUrls.current.set(flower.id, take.url)
      setFlowers((list) => [...list, flower])
      setTake(null)
      setWord('')
    } catch (e) {
      setError(e.message)
    }
  }

  function handleSelect(id) {
    const url = audioUrls.current.get(id)
    if (url) playFlower(url)
  }

  return (
    <main className="app">
      <GardenScene flowers={flowers} onFlowerSelect={handleSelect} />
      <header className="app-header">
        <h1>SUP <span>소리숲</span></h1>
        {import.meta.env.DEV && (
          <p className="dev-status">DEV · Supabase {statusLabels[supabaseStatus]}</p>
        )}
      </header>

      <section className="app-panel" aria-label="소리 녹음">
        <div className="kind-row">
          {[
            ['voice', '사람 목소리'],
            ['other', '다른 소리'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={kind === id ? 'chip active' : 'chip'}
              onClick={() => setKind(id)}
              disabled={recording}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="record-button"
          onClick={toggleRecording}
          disabled={!recording && !kind}
        >
          {recording ? `■ 멈추기 (${Math.max(0, Math.ceil(MAX_SECONDS - elapsed))}초)` : '● 10초 녹음'}
        </button>
        {!kind && !recording && <p className="hint">먼저 소리 종류를 골라 주세요.</p>}
        {error && <p className="error">{error}</p>}

        <div style={{ display: recording ? 'block' : 'none' }}>
          <Waveform stream={liveStream} />
        </div>

        {take && (
          <div className="preview">
            <audio src={take.url} controls />

            {kind === 'voice' && (
              <>
                {!emotionEnabled && <p className="hint">감정 분석 서버가 없어요. 아래에서 감정을 직접 골라 주세요.</p>}
                {analyzing && <p className="hint">목소리의 감정을 읽는 중…</p>}
                {emotionError && <p className="hint">감정 분석에 실패했어요. 직접 골라 주세요.</p>}
                {emotion && (
                  <p className="hint">감정: <b>{emotion.emotion}</b> (강도 {emotion.intensity.toFixed(2)})</p>
                )}
                <div className="kind-row">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={category === c.id ? 'chip active' : 'chip'}
                      onClick={() => setOverride(c.id)}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            {preview && (
              <div className="flower-card">
                <FlowerPreview flower={preview} />
                <h2>{preview.name}</h2>
                <p>{preview.reason}</p>
              </div>
            )}

            {kind === 'voice' && (
              <label className="word-field">
                꽃말
                <textarea
                  rows={2}
                  value={word}
                  placeholder="목소리가 받아 적히면 여기에 나와요. 직접 고칠 수 있어요."
                  onChange={(e) => setWord(e.target.value)}
                />
              </label>
            )}

            <div className="kind-row">
              <button type="button" className="record-button" onClick={plant} disabled={!preview}>
                정원에 심기
              </button>
              <button type="button" className="chip" onClick={() => setTake(null)}>
                다시 녹음
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
