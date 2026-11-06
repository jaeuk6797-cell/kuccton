// 녹음, 음향 특징 추출, 스테레오 재생

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

export async function decodeBlob(blob) {
  const buf = await blob.arrayBuffer()
  return await audioCtx().decodeAudioData(buf)
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

export async function resample(audioBuffer, rate = 16000) {
  const len = Math.ceil((audioBuffer.duration || audioBuffer.length / audioBuffer.sampleRate) * rate)
  const off = new OfflineAudioContext(1, Math.max(len, 1), rate)
  const src = off.createBufferSource()
  src.buffer = audioBuffer
  src.connect(off.destination)
  src.start()
  const rendered = await off.startRendering()
  return rendered.getChannelData(0)
}

// 반복 radix-2 FFT, 크기 스펙트럼 반환
function magnitudeSpectrum(frame) {
  const n = frame.length
  const re = Float32Array.from(frame)
  const im = new Float32Array(n)
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) { [re[i], re[j]] = [re[j], re[i]] }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k), wi = Math.sin(ang * k)
        const a = i + k, b = i + k + len / 2
        const xr = re[b] * wr - im[b] * wi
        const xi = re[b] * wi + im[b] * wr
        re[b] = re[a] - xr; im[b] = im[a] - xi
        re[a] += xr; im[a] += xi
      }
    }
  }
  const mag = new Float32Array(n / 2)
  for (let i = 0; i < n / 2; i++) mag[i] = Math.hypot(re[i], im[i])
  return mag
}

// 크기(RMS) · 밝기(spectral centroid) · 세기(어택) · 리듬(onset 수)
export function extractFeatures(samples, sampleRate) {
  const N = 1024, hop = 512
  const win = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)))
  const env = []
  let centroidSum = 0, centroidW = 0
  for (let start = 0; start + N <= samples.length; start += hop) {
    let sq = 0
    const frame = new Float32Array(N)
    for (let i = 0; i < N; i++) { const s = samples[start + i]; sq += s * s; frame[i] = s * win[i] }
    const r = Math.sqrt(sq / N)
    env.push(r)
    if (r > 0.003) {
      const mag = magnitudeSpectrum(frame)
      let num = 0, den = 0
      for (let k = 1; k < mag.length; k++) { num += k * mag[k]; den += mag[k] }
      if (den > 0) { centroidSum += (num / den) * (sampleRate / N) * r; centroidW += r }
    }
  }
  if (!env.length) return { rms: 0, centroid: 0, attack: 0, onsets: 1 }

  const maxEnv = Math.max(...env) || 1e-6
  const active = env.filter((r) => r > maxEnv * 0.05)
  const rms = active.reduce((a, b) => a + b, 0) / Math.max(active.length, 1)
  const centroid = centroidW ? centroidSum / centroidW : 0

  // 어택: 정규화된 엔벨로프의 최대 상승량 (프레임 2개 간격)
  let attack = 0
  for (let i = 2; i < env.length; i++) attack = Math.max(attack, (env[i] - env[i - 2]) / maxEnv)

  // onset: 엔벨로프 상승량(flux)의 피크 검출
  const flux = env.map((r, i) => (i ? Math.max(0, r - env[i - 1]) : 0))
  const mean = flux.reduce((a, b) => a + b, 0) / flux.length
  const std = Math.sqrt(flux.reduce((a, b) => a + (b - mean) ** 2, 0) / flux.length)
  const thr = mean + 1.5 * std
  const minGap = Math.round((0.12 * sampleRate) / hop)
  let onsets = 0, last = -Infinity
  for (let i = 1; i < flux.length - 1; i++) {
    if (flux[i] > thr && flux[i] >= flux[i - 1] && flux[i] >= flux[i + 1] && env[i] > maxEnv * 0.15 && i - last >= minGap) {
      onsets++; last = i
    }
  }
  return { rms, centroid, attack, onsets: Math.max(1, onsets) }
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
