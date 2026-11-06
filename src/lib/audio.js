// 녹음 포맷, 디코딩, 파형, 스테레오 재생
// 음향 특징 추출은 soundFeatures.js에 있다.

import { recordingGain, pcmWave } from './audioLevel.js'

let sharedCtx

export async function normalizeRecording(blob) {
  const buffer = await audioCtx().decodeAudioData(await blob.arrayBuffer())
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i))
  const gain = recordingGain(channels)
  return gain > 1.05 ? pcmWave(channels, buffer.sampleRate, gain) : blob
}

// ── 재생 음량 (정원의 빛 알갱이가 반응) ─────────────────────────────
// 지금 재생 중인 소리가 음량(0~1)을 알려 주는 함수를 등록한다. 재생이 끝나면 null.
let levelSource = null
export function setPlaybackLevelSource(fn) { levelSource = fn }
export function playbackLevel() {
  try { return levelSource ? Math.min(1, Math.max(0, levelSource())) : 0 } catch { return 0 }
}

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

// 우리의 꽃: 상대는 왼쪽(-1), 나는 오른쪽(+1)으로 동시에 재생
export function playStereo(leftBuffer, rightBuffer, onEnd) {
  const ctx = audioCtx()
  const nodes = []
  const startAt = ctx.currentTime + 0.05
  // 두 소리를 합친 실제 음량을 재서 정원에 알려 준다
  const meter = ctx.createAnalyser()
  meter.fftSize = 512
  meter.connect(ctx.destination)
  const data = new Uint8Array(meter.fftSize)
  const level = () => {
    meter.getByteTimeDomainData(data)
    let sq = 0
    for (const v of data) sq += ((v - 128) / 128) ** 2
    return Math.sqrt(sq / data.length) * 4
  }
  setPlaybackLevelSource(level)
  const release = () => { if (levelSource === level) setPlaybackLevelSource(null) }
  for (const [buf, pan] of [[leftBuffer, -1], [rightBuffer, 1]]) {
    const src = ctx.createBufferSource()
    src.buffer = buf
    const p = ctx.createStereoPanner()
    p.pan.value = pan
    src.connect(p).connect(meter)
    src.start(startAt)
    nodes.push(src)
  }
  const dur = Math.max(leftBuffer.duration, rightBuffer.duration)
  const t = setTimeout(() => { release(); onEnd && onEnd() }, dur * 1000 + 100)
  return {
    startedAt: startAt,
    duration: dur,
    stop() { clearTimeout(t); release(); nodes.forEach((n) => { try { n.stop() } catch {} }); onEnd && onEnd() },
  }
}
