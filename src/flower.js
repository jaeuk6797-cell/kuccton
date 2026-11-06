import { THRESHOLDS } from './soundFeatures.js'

// ── 사람 목소리: 감정 분석 결과로 카테고리를 고른다 ─────────────────────────────
// 감정 모델의 7종을 긍정 4 · 차분 1 · 부정 2로 묶었다 (voiceCategory 참고).
//   single: onset 1개, base: 2~3개, multi: 4개 이상,
//   yin: 크고 낮은 소리(음성모음), strong: 어택이 강한 소리(경음·격음)
// 단어는 팀 사전 담당이 한 번 검수한다.
export const CATEGORIES = [
  { id: 'joy', label: '기쁨', hue: 48, base: '깔깔', single: '하하', multi: '호호', yin: '껄껄', strong: '킥킥' },
  { id: 'excited', label: '신남', hue: 28, base: '룰루랄라', single: '랄랄', multi: '랄랄라', yin: '와글와글', strong: '와르르' },
  { id: 'flutter', label: '설렘', hue: 335, base: '콩닥콩닥', single: '콩닥', multi: '콩콩', yin: '두근두근' },
  { id: 'cozy', label: '포근함', hue: 140, base: '새근새근', single: '쌔근', yin: '포근포근' },
  { id: 'calm', label: '차분함', hue: 175, base: '도란도란', single: '두런두런', multi: '재잘재잘', yin: '웅성웅성' },
  { id: 'sad', label: '울적함', hue: 225, base: '훌쩍', single: '흑', multi: '훌쩍훌쩍', yin: '흑흑' },
  { id: 'tense', label: '긴장', hue: 270, base: '덜덜', single: '움찔', multi: '벌벌', yin: '오들오들', strong: '버럭' },
]

// 감정 모델 서버가 scores를 돌려주는 라벨 순서 (server/model.py의 LABELS)
const EMOTION_ORDER = ['행복', '분노', '혐오', '공포', '중립', '슬픔', '놀람']
// 긍정은 가중치를 올리고 부정은 낮춰서, 애매할 땐 부드러운 쪽으로 읽는다.
const EMOTION_WEIGHT = { 행복: 1.3, 놀람: 1.1, 중립: 1.0, 슬픔: 0.8, 분노: 0.6, 혐오: 0.6, 공포: 0.6 }

// 감정 분석 결과({ emotion, intensity, scores })와 음향 특징으로 사람 목소리 카테고리 id를 고른다.
export function voiceCategory(result, f) {
  const loud = f.rms >= THRESHOLDS.loudRms
  let label = result.emotion
  if (Array.isArray(result.scores) && result.scores.length === EMOTION_ORDER.length) {
    let best = -1
    EMOTION_ORDER.forEach((name, i) => {
      const score = result.scores[i] * EMOTION_WEIGHT[name]
      if (score > best) {
        best = score
        label = name
      }
    })
  }
  switch (label) {
    case '행복':
      if (result.intensity >= 1.3 || (loud && f.onsets >= 4)) return 'excited'
      if (result.intensity < 0.7 && !loud) return 'cozy'
      return 'joy'
    case '놀람':
      return 'flutter'
    case '중립':
      return 'calm'
    case '슬픔':
      return 'sad'
    default:
      return 'tense' // 분노, 혐오, 공포
  }
}

const COUNT_WORD = ['한', '한', '두', '세']

// intensity: 감정 강도(0~2). 있으면 꽃 크기에 반영한다.
export function buildFlower(categoryId, f, intensity) {
  const cat = CATEGORIES.find((c) => c.id === categoryId) ?? CATEGORIES[0]
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
  const reason = [`${cat.label} 목소리`, tone, `${count} ${word}`].filter(Boolean).join(', ')

  const strength = intensity == null ? 1 : 0.7 + 0.15 * Math.min(2, Math.max(0, intensity))
  return {
    name: `${word}꽃`,
    word,
    reason,
    petals: Math.min(8, Math.max(3, 3 + f.onsets)),
    size: Math.min(1, 0.55 + f.rms * 4) * strength,
    pointed: strongAttack || f.attack >= THRESHOLDS.weakAttack * 2,
    color: bright && !loud ? `hsl(${cat.hue} 65% 78%)` : `hsl(${cat.hue} 60% ${loud ? 42 : 58}%)`,
  }
}

// ── 사물 소리: 분류하지 않고 소리의 크기·밝기·세기·리듬·파형으로 꽃을 정한다 ───────
// 이름 = 리듬(onset 수) × 세기(어택) × 모음(크기·밝기). 실제 의성어만 적는다 (PRD 4.2).
//   rhythm: single(1개 이하) / base(2~3개) / multi(4개 이상)
//   attack: 0 약함(평음) / 1 중간(경음) / 2 강함(격음)   — 각 칸은 [양성모음, 음성모음]
const SOUND_WORDS = {
  single: [['톡', '툭'], ['똑', '뚝'], ['탁', '쿵']],
  base: [['토독', '투둑'], ['또각', '뚜벅'], ['타닥', '쿠당']],
  multi: [['토독토독', '투둑투둑'], ['또각또각', '뚜벅뚜벅'], ['타닥타닥', '쿠당쿠당']],
}
// 소리가 길게 이어질 때: [작고 맑음, 작고 낮음, 크고 맑음, 크고 낮음]
const SUSTAINED_WORDS = ['살랑', '사분사분', '쏴아', '웅웅']

const RHYTHM_TEXT = { single: '한 번 울려서', base: '두세 번 울려서', multi: '여러 번 울려서' }

// 밝기(spectral centroid)를 파랑(낮은 소리)에서 주황(높은 소리)으로 옮긴다.
function hueFromCentroid(centroid) {
  const t = (Math.log(Math.max(centroid, 200)) - Math.log(200)) / (Math.log(6000) - Math.log(200))
  return Math.round(240 - Math.min(1, t) * 200)
}

export function buildSoundFlower(f) {
  const loud = f.rms >= THRESHOLDS.loudRms
  const bright = f.centroid >= THRESHOLDS.brightCentroid
  const attackLevel = f.attack >= THRESHOLDS.strongAttack ? 2 : f.attack >= THRESHOLDS.weakAttack ? 1 : 0
  const yin = loud && !bright // 크고 낮은 소리만 음성모음, 나머지는 양성모음

  const sustained = f.sustain >= 0.6 && f.onsets <= 1 && attackLevel === 0
  const rhythm = f.onsets <= 1 ? 'single' : f.onsets >= 4 ? 'multi' : 'base'

  let word, how
  if (sustained) {
    word = SUSTAINED_WORDS[(loud ? 2 : 0) + (bright ? 0 : 1)]
    how = '길게 이어져서'
  } else {
    word = SOUND_WORDS[rhythm][attackLevel][yin ? 1 : 0]
    how = RHYTHM_TEXT[rhythm]
  }

  const tone = `${loud ? '크고' : '작고'} ${bright ? '맑은' : '낮은'} 소리`
  const edge = attackLevel === 2 ? '세게 터지고' : attackLevel === 1 ? '또렷하게' : ''
  const reason = [tone, edge && `${edge}`, `${how} ${word}`].filter(Boolean).join(', ')

  const petals = Math.min(8, Math.max(3, 3 + f.onsets))
  // 꽃잎 길이는 시간에 따른 소리 크기(파형)를 따라간다: 앞 꽃잎은 소리의 처음, 뒤 꽃잎은 끝
  const lengths = Array.from({ length: petals }, (_, i) => {
    const level = f.envelope[Math.min(f.envelope.length - 1, Math.floor((i / petals) * f.envelope.length))]
    return 0.55 + 0.45 * level
  })

  const hue = hueFromCentroid(f.centroid)
  return {
    name: `${word}꽃`,
    word,
    reason,
    petals,
    lengths,
    size: Math.min(1, 0.55 + f.rms * 4),
    pointed: attackLevel >= 1,
    color: loud ? `hsl(${hue} 60% 42%)` : `hsl(${hue} 65% ${bright ? 76 : 60}%)`,
  }
}
