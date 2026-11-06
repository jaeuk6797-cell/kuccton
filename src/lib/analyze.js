// 녹음 Blob → 음향 특징(rms, centroid, attack, onsets) → 꽃 파라미터
import { CATEGORIES, nameFlower } from './onomatopoeia.js'

const FRAME = 1024
const HOP = 512

function fftMag(re) {
  // radix-2 FFT, 입력 길이 = 2의 거듭제곱
  const n = re.length
  const im = new Float32Array(n)
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) { const t = re[i]; re[i] = re[j]; re[j] = t }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wr = Math.cos(ang), wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2
        const tr = re[b] * cr - im[b] * ci
        const ti = re[b] * ci + im[b] * cr
        re[b] = re[a] - tr; im[b] = im[a] - ti
        re[a] += tr; im[a] += ti
        const ncr = cr * wr - ci * wi
        ci = cr * wi + ci * wr; cr = ncr
      }
    }
  }
  const mag = new Float32Array(n / 2)
  for (let i = 0; i < n / 2; i++) mag[i] = Math.hypot(re[i], im[i])
  return mag
}

export async function decode(blob) {
  const buf = await blob.arrayBuffer()
  const ctx = new (window.AudioContext || window.webkitAudioContext)()
  const audio = await ctx.decodeAudioData(buf)
  ctx.close()
  return audio
}

export function extractFeatures(audioBuffer) {
  const data = audioBuffer.getChannelData(0)
  const sr = audioBuffer.sampleRate
  const env = []
  let centroidSum = 0, centroidW = 0
  const win = new Float32Array(FRAME)
  for (let i = 0; i < FRAME; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1))

  for (let start = 0; start + FRAME <= data.length; start += HOP) {
    let sq = 0
    const frame = new Float32Array(FRAME)
    for (let i = 0; i < FRAME; i++) {
      const s = data[start + i]
      sq += s * s
      frame[i] = s * win[i]
    }
    const rms = Math.sqrt(sq / FRAME)
    env.push(rms)
    if (rms > 0.005) {
      const mag = fftMag(frame)
      let num = 0, den = 0
      for (let k = 0; k < mag.length; k++) { num += k * mag[k]; den += mag[k] }
      if (den > 0) { centroidSum += (num / den) * (sr / FRAME) * rms; centroidW += rms }
    }
  }

  const max = Math.max(...env, 1e-6)
  const active = env.filter((v) => v > max * 0.1)
  const rms = active.length ? active.reduce((a, b) => a + b, 0) / active.length : 0
  const centroid = centroidW ? centroidSum / centroidW : 0

  // 어택: 엔벨로프의 최대 상승량을 최대값으로 정규화
  let attack = 0
  for (let i = 1; i < env.length; i++) attack = Math.max(attack, (env[i] - env[i - 1]) / max)

  // onset: 문턱을 위로 넘는 순간을 센다(최소 간격 120ms)
  const th = max * 0.35
  const minGap = Math.round((0.12 * sr) / HOP)
  let onsets = 0, last = -minGap
  for (let i = 1; i < env.length; i++) {
    if (env[i - 1] < th && env[i] >= th && i - last >= minGap) { onsets++; last = i }
  }

  return { rms, centroid, attack: Math.min(1, attack * 2), onsets: Math.max(1, onsets), duration: audioBuffer.duration }
}

// 꽃 데이터(팀 공통 계약). 3D 담당은 이 객체만 받아 그리면 된다.
export function buildFlower({ id, sender, category, features, transcript, audioUrl }) {
  const cat = CATEGORIES[category] || CATEGORIES.other
  const { word, name, reason, phonology } = nameFlower(category, features)
  return {
    id,
    sender,
    category,
    word,
    name,
    reason,
    zone: cat.zone,
    color: cat.color,
    petals: Math.min(8, Math.max(3, 2 + features.onsets)),
    layers: phonology.vowel === 'bright' ? 2 : 3,
    size: phonology.vowel === 'bright' ? 0.55 : 0.85,
    pointy: phonology.consonant !== 'plain',
    glow: Math.min(4, 1 + features.rms * 25),
    transcript: transcript || null,
    audioUrl,
    features,
    sentDate: new Date().toISOString().slice(0, 10),
    createdAt: Date.now(),
  }
}
