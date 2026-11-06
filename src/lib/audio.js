// 녹음 포맷, 디코딩, 파형, 스테레오 재생
// 음향 특징 추출은 soundFeatures.js에 있다.

let sharedCtx
export function audioCtx() {
  if (!sharedCtx) sharedCtx = new (window.AudioContext || window.webkitAudioContext)()
  if (sharedCtx.state === 'suspended') sharedCtx.resume()
  return sharedCtx
}

export function pickMimeType() {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac']
  return types.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || ''
}

export function toMono(audioBuffer) {
  const n = audioBuffer.length
  const out = new Float32Array(n)
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    const d = audioBuffer.getChannelData(ch)
    for (let i = 0; i < n; i++) out[i] += d[i] / audioBuffer.numberOfChannels
  }
  return out
}

// 파형 그리기용 피크 배열
export function peaks(samples, count = 120) {
  const out = []
  const step = Math.max(1, Math.floor(samples.length / count))
  for (let i = 0; i < count; i++) {
    let m = 0
    for (let j = i * step; j < Math.min((i + 1) * step, samples.length); j++) m = Math.max(m, Math.abs(samples[j]))
    out.push(m)
  }
  const max = Math.max(...out, 1e-6)
  return out.map((v) => v / max)
}

// 우리의 꽃: 상대는 왼쪽(-0.8), 나는 오른쪽(+0.8)으로 동시에 재생
export function playStereo(leftBuffer, rightBuffer, onEnd) {
  const ctx = audioCtx()
  const nodes = []
  const startAt = ctx.currentTime + 0.05
  for (const [buf, pan] of [[leftBuffer, -0.8], [rightBuffer, 0.8]]) {
    const src = ctx.createBufferSource()
    src.buffer = buf
    const p = ctx.createStereoPanner()
    p.pan.value = pan
    src.connect(p).connect(ctx.destination)
    src.start(startAt)
    nodes.push(src)
  }
  const dur = Math.max(leftBuffer.duration, rightBuffer.duration)
  const t = setTimeout(() => onEnd && onEnd(), dur * 1000 + 100)
  return {
    startedAt: startAt,
    duration: dur,
    stop() { clearTimeout(t); nodes.forEach((n) => { try { n.stop() } catch {} }); onEnd && onEnd() },
  }
}
