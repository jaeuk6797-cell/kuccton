import { THRESHOLDS } from './soundFeatures.js'

// PRD 4.3 카테고리 사전. 변형형은 실제 단어만 적는다.
//   single: onset 1개, base: 2~3개, multi: 4개 이상,
//   yin: 크고 낮은 소리(음성모음), strong: 어택이 강한 소리(경음·격음)
// 표의 '졌졌', '달그량', '왜자지껌'은 오타로 보고 '졸졸', '달그락', '왁자지껄'로 적었다.
export const CATEGORIES = [
  { id: 'rain', label: '비', group: 'water', base: '토독', single: '톡', multi: '토도독', yin: '투둑' },
  { id: 'water', label: '물·시냇물', group: 'water', base: '졸졸', strong: '쫄쫄', yin: '줄줄' },
  { id: 'wind', label: '바람', group: 'life', base: '살랑', yin: '심렁', strong: '윙윙' },
  { id: 'bird', label: '새', group: 'animal', base: '짹짹', multi: '짹짹짹' },
  { id: 'cat', label: '고양이', group: 'animal', base: '야옹', yin: '애옹' },
  { id: 'dog', label: '개', group: 'animal', base: '멍멍', strong: '왕왕' },
  { id: 'walk', label: '발소리', group: 'life', base: '또각', yin: '뚜벅', strong: '쿠당' },
  { id: 'typing', label: '키보드', group: 'life', base: '톡톡', multi: '타닥타닥' },
  { id: 'frying', label: '요리·튀김', group: 'life', base: '지글', multi: '지글지글', strong: '치익' },
  { id: 'dishes', label: '그릇·수저', group: 'life', base: '달그락', yin: '덜그럭', strong: '땡' },
  { id: 'vehicle', label: '교통', group: 'life', base: '덜컥', multi: '덜컥덜컥', strong: '부릉' },
  { id: 'applause', label: '박수', group: 'laugh', base: '짝짝', multi: '짝짝짝' },
  { id: 'laugh', voice: true, label: '웃음', group: 'laugh', base: '깔깔', single: '하하', yin: '껄껄', strong: '킥킥' },
  { id: 'sing', voice: true, label: '노래·허밍', group: 'voice', base: '흥얼', multi: '흥얼흥얼', strong: '랄랄' },
  { id: 'whisper', voice: true, label: '속삭임', group: 'voice', base: '소곤소곤', yin: '수군수군' },
  { id: 'speech', voice: true, label: '사람 목소리', group: 'voice', base: '도란도란', multi: '재잘재잘', yin: '왁자지껄' },
  { id: 'other', label: '기타', group: 'other', base: '사분사분', yin: '웅웅' },
]

// 녹음 전에 고른 '사람 목소리 / 다른 소리'에 맞춰 보여 줄 카테고리를 나눈다.
export const categoriesFor = (kind) => CATEGORIES.filter((c) => Boolean(c.voice) === (kind === 'voice'))

const HUE = { water: 210, laugh: 48, voice: 335, animal: 25, life: 130, other: 270 }
const COUNT_WORD = ['한', '한', '두', '세']

export function buildFlower(categoryId, f) {
  const cat = CATEGORIES.find((c) => c.id === categoryId) ?? CATEGORIES.at(-1)
  const loud = f.rms >= THRESHOLDS.loudRms
  const bright = f.centroid >= THRESHOLDS.brightCentroid
  const strongAttack = f.attack >= THRESHOLDS.strongAttack

  let word = f.onsets <= 1 ? (cat.single ?? cat.base) : f.onsets >= 4 ? (cat.multi ?? cat.base) : cat.base
  let tone = ''
  if (strongAttack && cat.strong) {
    word = cat.strong
    tone = '소리가 세게 터져서'
  } else if (loud && !bright && cat.yin) {
    word = cat.yin
    tone = '크고 낮은 소리라 음성모음'
  } else if (!loud && bright) {
    tone = '작고 맑은 소리라 양성모음'
  }

  const count = f.onsets >= 4 ? '여러 번 울려서' : `${COUNT_WORD[Math.max(f.onsets, 1)] ?? '여러'} 번 울려서`
  const reason = [tone, `${count} ${word}`].filter(Boolean).join(', ')

  const hue = HUE[cat.group]
  return {
    name: `${word}꽃`,
    word,
    reason,
    petals: Math.min(8, Math.max(3, 3 + f.onsets)),
    size: Math.min(1, 0.55 + f.rms * 4),
    pointed: strongAttack || f.attack >= THRESHOLDS.weakAttack * 2,
    color: bright && !loud ? `hsl(${hue} 65% 78%)` : `hsl(${hue} 60% ${loud ? 42 : 58}%)`,
  }
}
