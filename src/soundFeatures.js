// PRD 4.1: 크기(RMS), 밝기(spectral centroid), 세기(attack), 리듬(onset 수)
// 임계값은 샘플 20개를 녹음해 중간값으로 다시 잡는다 (PRD 4.1).
export const THRESHOLDS = {
  loudRms: 0.08,
  brightCentroid: 2000, // Hz
  strongAttack: 0.5,
  weakAttack: 0.2,
}

const FRAME = 1024
const HOP = 512

function fft(re, im) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k)
        const wi = Math.sin(ang * k)
        const ur = re[i + k]
        const ui = im[i + k]
        const vr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi
        const vi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr
        re[i + k] = ur + vr
        im[i + k] = ui + vi
        re[i + k + len / 2] = ur - vr
        im[i + k + len / 2] = ui - vi
      }
    }
  }
}

export async function extractFeatures(blob) {
  const ctx = new AudioContext()
  const buf = await ctx.decodeAudioData(await blob.arrayBuffer())
  ctx.close()
  const x = buf.getChannelData(0)
  const sr = buf.sampleRate

  const env = []
  const centroids = []
  const weights = []
  for (let s = 0; s + FRAME <= x.length; s += HOP) {
    const re = new Float64Array(FRAME)
    const im = new Float64Array(FRAME)
    let sum = 0
    for (let i = 0; i < FRAME; i++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1)) // Hann
      re[i] = x[s + i] * w
      sum += x[s + i] * x[s + i]
    }
    env.push(Math.sqrt(sum / FRAME))
    fft(re, im)
    let num = 0
    let den = 0
    for (let k = 1; k < FRAME / 2; k++) {
      const mag = Math.hypot(re[k], im[k])
      num += ((k * sr) / FRAME) * mag
      den += mag
    }
    centroids.push(den > 0 ? num / den : 0)
    weights.push(den)
  }

  const rms = env.reduce((a, b) => a + b, 0) / Math.max(env.length, 1)
  const peak = Math.max(...env, 1e-9)

  const wsum = weights.reduce((a, b) => a + b, 0)
  const centroid = wsum > 0 ? centroids.reduce((a, c, i) => a + c * weights[i], 0) / wsum : 0

  let maxRise = 0
  for (let i = 1; i < env.length; i++) maxRise = Math.max(maxRise, env[i] - env[i - 1])
  const attack = maxRise / peak

  // 임계값을 위로 넘어서는 순간을 소리 이벤트로 센다 (최소 간격 약 6프레임)
  const sorted = [...env].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)] || 0
  const threshold = Math.max(0.35 * peak, 1.5 * median)
  let onsets = 0
  let lastOnset = -100
  for (let i = 1; i < env.length; i++) {
    if (env[i] >= threshold && env[i - 1] < threshold && i - lastOnset >= 6) {
      onsets++
      lastOnset = i
    }
  }

  // 소리가 얼마나 이어졌는지: 최대 크기의 25%를 넘는 프레임 비율
  const sustain = env.filter((v) => v >= 0.25 * peak).length / Math.max(env.length, 1)

  // 시간에 따른 소리 크기(파형 윤곽): 8구간 평균을 최대값 1로 맞춘다
  const BINS = 8
  const envelope = Array.from({ length: BINS }, (_, b) => {
    const from = Math.floor((b * env.length) / BINS)
    const to = Math.max(from + 1, Math.floor(((b + 1) * env.length) / BINS))
    const part = env.slice(from, to)
    return part.reduce((acc, v) => acc + v, 0) / Math.max(part.length, 1) / peak
  })

  return { rms, centroid, attack, onsets, sustain, envelope, duration: buf.duration }
}
