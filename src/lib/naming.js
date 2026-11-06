// 꽃 이름 규칙은 flower.js(목소리: 감정 7종 / 사물 소리: 음향 특징)에 있다.
// 여기에는 두 꽃을 잇는 규칙과, 꽃 객체를 DB 행으로 바꾸는 함수만 둔다.
import { THRESHOLDS } from './soundFeatures.js'
import { CATEGORIES } from './flower.js'

// 합성 꽃 이름: 각 이름의 첫 두 음절을 보낸 순서대로 잇는다. (토독 + 도란도란 = 토독도란꽃)
export function pairName(wordA, wordB) {
  return `${[...wordA].slice(0, 2).join('')}${[...wordB].slice(0, 2).join('')}꽃`
}

export function categoryLabel(id) {
  if (id === 'sound') return '사물 소리'
  const c = CATEGORIES.find((x) => x.id === id)
  return c ? `${c.label} 목소리` : ''
}

export const isVoiceCategory = (id) => CATEGORIES.some((c) => c.id === id)

// flower.js가 만든 꽃 + 음향 특징 → flowers 테이블 행
export function toFlowerRow({ flower, features, kind, category, transcript }) {
  const loud = features.rms >= THRESHOLDS.loudRms
  const bright = features.centroid >= THRESHOLDS.brightCentroid
  return {
    category: kind === 'voice' ? category : 'sound',
    root: flower.word,
    name: flower.name,
    reason: flower.reason,
    transcript: transcript || null,
    rms: features.rms,
    centroid: features.centroid,
    attack: features.attack,
    onsets: features.onsets,
    vowel: loud && !bright ? 'E' : 'Y', // 크고 낮은 소리만 음성모음
    consonant: flower.pointed ? '경' : '평',
    color: flower.color,
    petals: flower.petals,
    lengths: flower.lengths ?? null, // 꽃잎별 길이 = 시간에 따른 소리 크기
  }
}
