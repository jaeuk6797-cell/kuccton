// 10초 녹음 + 동시에 Web Speech API로 받아 적기(꽃말용)
export const MAX_SECONDS = 10

function pickMime() {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  return types.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || ''
}

export async function startRecording({ onTick } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const mimeType = pickMime()
  const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
  const chunks = []
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)

  // STT (지원 브라우저만)
  let transcript = ''
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  let stt = null
  if (SR) {
    stt = new SR()
    stt.lang = 'ko-KR'
    stt.interimResults = false
    stt.continuous = true
    stt.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) transcript += e.results[i][0].transcript
      }
    }
    stt.onerror = () => {}
    try { stt.start() } catch {}
  }

  const started = performance.now()
  const timer = setInterval(() => {
    const t = (performance.now() - started) / 1000
    onTick && onTick(Math.min(t, MAX_SECONDS))
    if (t >= MAX_SECONDS) stop()
  }, 100)

  let resolveDone
  const done = new Promise((r) => (resolveDone = r))
  rec.onstop = () => {
    clearInterval(timer)
    stream.getTracks().forEach((t) => t.stop())
    // STT 마지막 결과가 들어올 시간을 조금 준다
    setTimeout(() => {
      resolveDone({ blob: new Blob(chunks, { type: rec.mimeType || 'audio/webm' }), transcript: transcript.trim() })
    }, 400)
  }

  function stop() {
    if (rec.state !== 'inactive') rec.stop()
    if (stt) try { stt.stop() } catch {}
  }

  rec.start()
  return { stop, done }
}
