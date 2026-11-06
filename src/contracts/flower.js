export const FLOWER_CATEGORIES = Object.freeze(/** @type {const} */ ([
  'rain', 'water', 'wind', 'bird', 'cat', 'dog', 'footsteps', 'typing',
  'frying', 'dishes', 'vehicle', 'applause', 'laughter', 'singing',
  'whisper', 'speech', 'other',
]))

export const FLOWER_ZONES = Object.freeze(/** @type {const} */ ([
  'water', 'hill', 'shade', 'sunny', 'path',
]))

/**
 * @typedef {typeof FLOWER_CATEGORIES[number]} FlowerCategory
 * @typedef {typeof FLOWER_ZONES[number]} FlowerZone
 *
 * @typedef {Object} AudioFeatures
 * @property {number} rms 평균 음량 (0–1)
 * @property {number} centroid 스펙트럼 중심 주파수 (Hz, 0 이상)
 * @property {number} attack 정규화된 어택 (0–1)
 * @property {number} onsets 소리 시작 횟수 (0 이상의 정수)
 * @property {number} duration 녹음 길이 (초, 0 이상)
 *
 * @typedef {Object} FlowerAppearance
 * @property {FlowerZone} zone
 * @property {string} color #RRGGBB
 * @property {number} petals 꽃잎 수 (3–8 사이 정수)
 * @property {number} layers 겹 수 (1–3 사이 정수)
 * @property {number} size 상대 크기 (0 초과, 1 이하)
 * @property {boolean} pointy
 * @property {number} glow 발광 강도 (0–4)
 *
 * @typedef {Object} Flower
 * @property {string} id UUID
 * @property {string} gardenId 정원 UUID
 * @property {string} senderId Supabase 사용자 UUID
 * @property {FlowerCategory} category 분류 불명 시 other
 * @property {string} word
 * @property {string} name
 * @property {string} reason
 * @property {string | null} transcript 꽃말이 없으면 null
 * @property {AudioFeatures} features
 * @property {FlowerAppearance} appearance
 * @property {string | null} audioPath 비공개 버킷 내 상대 경로. 업로드 전에는 null
 * @property {string} sentDate 정원 기준 날짜 (YYYY-MM-DD)
 * @property {string} createdAt UTC ISO 8601 시각 (초 또는 밀리초 정밀도, Z 접미사)
 */

/** @type {Readonly<FlowerAppearance>} */
export const DEFAULT_FLOWER_APPEARANCE = Object.freeze({
  zone: 'path',
  color: '#B9A4D7',
  petals: 5,
  layers: 2,
  size: 0.55,
  pointy: false,
  glow: 1,
})

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
const isoUtc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/
const calendarDate = /^\d{4}-\d{2}-\d{2}$/

const isText = (value) => typeof value === 'string' && value.trim().length > 0
const inRange = (value, min, max = Infinity) => Number.isFinite(value) && value >= min && value <= max
const isCount = (value, min, max) => Number.isInteger(value) && inRange(value, min, max)

function isUtcTimestamp(value) {
  if (typeof value !== 'string' || !isoUtc.test(value)) return false
  const date = new Date(value)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 19) === value.slice(0, 19)
}

function isAudioPath(value) {
  return value === null || (isText(value)
    && !/[:?#\\]/.test(value)
    && value.split('/').every((segment) => isText(segment) && segment !== '.' && segment !== '..'))
}

/**
 * 모듈 사이에서 전달되는 꽃 데이터를 확인한다.
 * @param {unknown} value
 * @returns {value is Flower}
 */
export function isFlower(value) {
  if (!value || typeof value !== 'object') return false
  const { id, gardenId, senderId, category, word, name, reason, transcript,
    features, appearance, audioPath, sentDate, createdAt } = value

  return [id, gardenId, senderId].every((id) => typeof id === 'string' && uuid.test(id))
    && FLOWER_CATEGORIES.includes(category)
    && [word, name, reason].every(isText)
    && (transcript === null || typeof transcript === 'string')
    && features != null
    && inRange(features.rms, 0, 1)
    && inRange(features.centroid, 0)
    && inRange(features.attack, 0, 1)
    && isCount(features.onsets, 0)
    && inRange(features.duration, 0)
    && appearance != null
    && FLOWER_ZONES.includes(appearance.zone)
    && typeof appearance.color === 'string'
    && /^#[0-9a-f]{6}$/i.test(appearance.color)
    && isCount(appearance.petals, 3, 8)
    && isCount(appearance.layers, 1, 3)
    && inRange(appearance.size, 0, 1) && appearance.size > 0
    && typeof appearance.pointy === 'boolean'
    && inRange(appearance.glow, 0, 4)
    && isAudioPath(audioPath)
    && typeof sentDate === 'string'
    && calendarDate.test(sentDate)
    && isUtcTimestamp(`${sentDate}T00:00:00Z`)
    && isUtcTimestamp(createdAt)
}
