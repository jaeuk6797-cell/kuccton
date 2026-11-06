// 꽃 생성 결과(flowerNaming.js) → 공용 꽃 데이터 계약(contracts/flower.js) 어댑터.
// 정원·사용자 저장 계층(Supabase)이 붙기 전까지는 로컬 임시 ID를 쓴다.
import { isFlower } from '../contracts/flower.js'
import { THRESHOLDS } from './soundFeatures.js'

export const LOCAL_GARDEN_ID = '00000000-0000-4000-8000-000000000001'
export const LOCAL_SENDER_ID = '00000000-0000-4000-8000-000000000002'

const clamp = (v, min, max) => Math.min(max, Math.max(min, v))

// 'hsl(215 60% 58%)' → '#RRGGBB'
function hslToHex(css) {
  const m = /hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)/.exec(css)
  if (!m) throw new Error(`색상 형식을 읽을 수 없어요: ${css}`)
  const h = Number(m[1])
  const s = Number(m[2]) / 100
  const l = Number(m[3]) / 100
  const k = (n) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return `#${[f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`
}

// 정원 시간대는 아직 정해지지 않아 기기 로컬 날짜를 쓴다.
function localDate(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * @param {{ result: object, kind: 'voice' | 'other', features: object, transcript?: string }} input
 *   result: flowerNaming.js의 buildFlower / buildSoundFlower 결과
 * @returns {import('../contracts/flower.js').Flower}
 */
export function toFlower({ result, kind, features, transcript }) {
  // 계약의 카테고리는 17개뿐이라 목소리는 speech, 분류하지 않는 사물 소리는 other로 둔다.
  // 감정(기쁨, 울적함 …)은 이름과 reason에 담긴다.
  const voice = kind === 'voice'
  const dark = features.rms >= THRESHOLDS.loudRms && features.centroid < THRESHOLDS.brightCentroid

  const flower = {
    id: crypto.randomUUID(),
    gardenId: LOCAL_GARDEN_ID,
    senderId: LOCAL_SENDER_ID,
    category: voice ? 'speech' : 'other',
    word: result.word,
    name: result.name,
    reason: result.reason,
    transcript: voice && transcript?.trim() ? transcript.trim() : null,
    features: {
      rms: clamp(features.rms, 0, 1),
      centroid: Math.max(0, features.centroid),
      attack: clamp(features.attack, 0, 1),
      onsets: Math.max(0, Math.round(features.onsets)),
      duration: Math.max(0, features.duration),
    },
    appearance: {
      zone: voice ? 'shade' : 'path',
      color: hslToHex(result.color),
      petals: clamp(Math.round(result.petals), 3, 8),
      layers: dark ? 3 : 2,
      size: clamp(result.size, 0.2, 1),
      pointy: Boolean(result.pointed),
      glow: clamp(1 + features.rms * 25, 0, 4),
    },
    audioPath: null,
    sentDate: localDate(),
    createdAt: new Date().toISOString(),
  }

  if (!isFlower(flower)) throw new Error('꽃 데이터가 공용 계약에 맞지 않아요')
  return flower
}
