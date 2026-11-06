import { useCallback, useEffect, useRef, useState } from 'react'

// PRD F4: Web Speech API(ko-KR)로 녹음과 동시에 받아 적어 꽃말로 쓴다.
// 미지원 브라우저(iOS Safari 등)는 supported=false, 꽃말은 직접 입력한다.
const SpeechRecognition =
  typeof window !== 'undefined' &&
  (window.SpeechRecognition || window.webkitSpeechRecognition)

export function useSpeechRecognition({ lang = 'ko-KR' } = {}) {
  const recRef = useRef(null)
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [interim, setInterim] = useState('')
  const [error, setError] = useState(null)

  const start = useCallback(() => {
    if (!SpeechRecognition) return
    setTranscript('')
    setInterim('')
    setError(null)

    const rec = new SpeechRecognition()
    rec.lang = lang
    rec.continuous = true
    rec.interimResults = true

    rec.onresult = (e) => {
      let finalText = ''
      let interimText = ''
      for (let i = 0; i < e.results.length; i++) {
        const text = e.results[i][0].transcript
        if (e.results[i].isFinal) finalText += text
        else interimText += text
      }
      setTranscript(finalText.trim())
      setInterim(interimText.trim())
    }
    rec.onerror = (e) => setError(e.error)
    rec.onend = () => {
      setListening(false)
      setInterim('')
    }

    recRef.current = rec
    rec.start()
    setListening(true)
  }, [lang])

  const stop = useCallback(() => {
    recRef.current?.stop()
  }, [])

  useEffect(() => () => recRef.current?.abort(), [])

  return {
    supported: Boolean(SpeechRecognition),
    listening,
    transcript,
    interim,
    error,
    start,
    stop,
    setTranscript,
  }
}
