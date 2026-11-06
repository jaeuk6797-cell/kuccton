// PRD 4.1: 크기(RMS), 밝기(spectral centroid), 세기(attack), 리듬(onset 수)
// 임계값은 ESC-50(2,000클립) 분포로 잡은 초안이다. 폰 마이크로 녹음한 샘플로 다시 맞출 것 (PRD 4.1).
export const THRESHOLDS = {
  loudRms: 0.07, // 상위 약 35%
  quietRms: 0.03, // 하위 약 40%: 작지만 또렷하게 터지는 소리(물방울·클릭·타자)는 '타닥' 대신 '톡' 계열
  brightCentroid: 3000, // Hz, 중간값
  strongAttack: 0.55, // 상위 약 25%
  weakAttack: 0.3, // 하위 약 40%
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

// 80Hz 아래(손에 쥘 때의 덜컹거림, 바람)를 잘라 낸다. 특징 계산에만 쓰고 녹음 파일은 그대로 둔다.
function highpass(x, sr, fc = 80) {
  const w = (2 * Math.PI * fc) / sr
  const cos = Math.cos(w)
  const alpha = Math.sin(w) / (2 * 0.7071)
  const b0 = (1 + cos) / 2
  const b1 = -(1 + cos)
  const a0 = 1 + alpha
  const a1 = -2 * cos
  const a2 = 1 - alpha
  const y = new Float32Array(x.length)
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  for (let i = 0; i < x.length; i++) {
    const v = (b0 * x[i] + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2) / a0
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v
    y[i] = v
  }
  return y
}

// 폰 마이크는 이득과 잡음이 기기마다 달라서 절대 크기를 믿기 어렵다.
// 그래서 녹음 안에서 가장 조용한 구간을 '바닥 소음'으로 보고, 그보다 크게 울린 구간만으로 특징을 잰다.
const FLOOR_PERCENTILE = 0.1 // 프레임 크기 하위 10%를 바닥 소음으로
const ACTIVE_RATIO = 2 // 바닥 소음의 2배를 넘으면 소리가 난 프레임
const STEADY_RATIO = 0.5 // 바닥 소음이 최대 크기의 이 비율 이상이면 계속 이어지는 소리로 본다
const MIN_FLOOR = 1e-4 // 완전 무음에서 0으로 나누지 않게

export async function extractFeatures(blob) {
  const ctx = new AudioContext()
  const buf = await ctx.decodeAudioData(await blob.arrayBuffer())
  ctx.close()
  const sr = buf.sampleRate
  const x = highpass(buf.getChannelData(0), sr)

  const env = []
  const mags = []
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
    const mag = new Float32Array(FRAME / 2)
    for (let k = 1; k < FRAME / 2; k++) mag[k] = Math.hypot(re[k], im[k])
    mags.push(mag)
  }

  const n = Math.max(env.length, 1)
  const sortedEnv = [...env].sort((a, b) => a - b)
  const peakRaw = Math.max(...env, 1e-9)
  // 가장 조용한 구간이 최대 크기의 절반 이상이면 비·엔진·바람처럼 계속 이어지는 소리다.
  // 한 장의 녹음만으로는 이런 소리와 배경 소음을 구분할 수 없으니 바닥 소음을 빼지 않는다.
  const rawFloor = sortedEnv[Math.floor(FLOOR_PERCENTILE * env.length)] || 0
  const steady = rawFloor > STEADY_RATIO * peakRaw
  const floor = steady ? 0 : rawFloor

  // 바닥 소음의 스펙트럼: 가장 조용한 20% 프레임의 평균. 소리 난 프레임에서 빼서 쉬익 하는 잡음이 밝기를 올리지 않게 한다.
  const quietLimit = sortedEnv[Math.floor(0.2 * env.length)] ?? 0
  const noiseMag = new Float32Array(FRAME / 2)
  let quietCount = 0
  env.forEach((e, i) => {
    if (e > quietLimit) return
    quietCount++
    for (let k = 1; k < FRAME / 2; k++) noiseMag[k] += mags[i][k]
  })
  if (quietCount && !steady) for (let k = 1; k < FRAME / 2; k++) noiseMag[k] /= quietCount
  else noiseMag.fill(0) // 계속 이어지는 소리의 스펙트럼을 잡음으로 빼면 소리가 사라진다

  const activeMin = Math.max(ACTIVE_RATIO * floor, MIN_FLOOR)
  let active = env.map((e) => e > activeMin)
  if (!active.some(Boolean)) active = env.map(() => true) // 거의 무음이면 전체를 쓴다

  // 소리가 난 프레임만의 평균 크기(무음 구간이 평균을 깎지 않게)
  let rmsSum = 0
  let rmsN = 0
  let num = 0
  let den = 0
  env.forEach((e, i) => {
    if (!active[i]) return
    rmsSum += e
    rmsN++
    let cNum = 0
    let cDen = 0
    for (let k = 1; k < FRAME / 2; k++) {
      const m = Math.max(mags[i][k] - noiseMag[k], 0)
      cNum += ((k * sr) / FRAME) * m
      cDen += m
    }
    num += cNum
    den += cDen
  })
  const rms = rmsN ? rmsSum / rmsN : 0
  const centroid = den > 0 ? num / den : 0

  // 바닥 소음을 뺀 윤곽으로 어택·리듬·지속·파형을 본다
  const clean = env.map((e) => Math.max(e - floor, 0))
  const peak = Math.max(...clean, 1e-9)

  let maxRise = 0
  for (let i = 1; i < clean.length; i++) maxRise = Math.max(maxRise, clean[i] - clean[i - 1])
  const attack = maxRise / peak

  // 임계값을 위로 넘어서는 순간을 소리 이벤트로 센다 (최소 간격 약 6프레임)
  const sortedClean = [...clean].sort((a, b) => a - b)
  const median = sortedClean[Math.floor(sortedClean.length / 2)] || 0
  const threshold = Math.max(0.35 * peak, 1.5 * median)
  let onsets = 0
  let lastOnset = -100
  for (let i = 1; i < clean.length; i++) {
    if (clean[i] >= threshold && clean[i - 1] < threshold && i - lastOnset >= 6) {
      onsets++
      lastOnset = i
    }
  }

  // 소리가 얼마나 이어졌는지: 최대 크기의 25%를 넘는 프레임 비율
  const sustain = clean.filter((v) => v >= 0.25 * peak).length / n

  // 시간에 따른 소리 크기(파형 윤곽): 8구간 평균을 최대값 1로 맞춘다
  const BINS = 8
  const envelope = Array.from({ length: BINS }, (_, b) => {
    const from = Math.floor((b * clean.length) / BINS)
    const to = Math.max(from + 1, Math.floor(((b + 1) * clean.length) / BINS))
    const part = clean.slice(from, to)
    return part.reduce((acc, v) => acc + v, 0) / Math.max(part.length, 1) / peak
  })

  // 바닥 소음보다 몇 dB 큰 소리인가(기기 이득과 무관한 크기). 너무 작으면 안내하는 데 쓴다
  const snr = Math.min(60, 20 * Math.log10(peakRaw / Math.max(floor, MIN_FLOOR)))

  return { rms, centroid, attack, onsets, sustain, envelope, snr, duration: buf.duration }
}
