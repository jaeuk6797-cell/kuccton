import { useEffect, useRef, useState } from 'react'
import { useSpeechRecognition } from './useSpeechRecognition.js'

const MAX_SECONDS = 10

export default function App() {
  const stt = useSpeechRecognition()
  const [recording, setRecording] = useState(false)
  const [left, setLeft] = useState(MAX_SECONDS)
  const [audioUrl, setAudioUrl] = useState(null)
  const [micError, setMicError] = useState(null)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)

  useEffect(() => () => clearInterval(timerRef.current), [])

  async function startRecording() {
    setMicError(null)
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
      setAudioUrl(URL.createObjectURL(new Blob(chunksRef.current, { type: recorder.mimeType })))
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
