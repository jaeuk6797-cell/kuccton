// 의성어 꽃 이름 규칙 (PRD 4장)
// 1) 카테고리 → 어근 사전  2) 음향 특징 → 모음(양성/음성)·자음(평/경/격)·반복(1/2/3)
// 사전에는 실제 단어만 두고, 특징과 가장 가까운 단어를 고른다.

// 임계값: 해커톤 초반 샘플 20개 녹음 후 중간값으로 조정하세요.
export const THRESHOLDS = {
  rmsLoud: 0.06, // 평균 RMS 이 이상이면 '큰 소리'
  centroidBright: 2200, // Hz, 이 이상이면 '밝은 소리'
  attackMid: 0.12, // 엔벨로프 최대 상승량(정규화) 이 이상이면 경음
  attackStrong: 0.35, // 이 이상이면 격음
}

// v: Y=양성, E=음성 / c: 평, 경, 격 / r: 1=단일, 2=기본, 3=첩어 / n: 이 onset 수일 때 가산점
const W = (word, v, c, r, n) => ({ word, v, c, r, n })

export const CATEGORIES = {
  rain: { label: '비', family: 'water', root: '토독', variants: [W('톡', 'Y', '격', 1), W('토독', 'Y', '격', 2), W('토도독', 'Y', '격', 2, 3), W('토독토독', 'Y', '격', 3), W('똑똑', 'Y', '경', 2), W('투둑', 'E', '격', 2), W('후두둑', 'E', '격', 3), W('뚝', 'E', '경', 1), W('뚝뚝', 'E', '경', 2)] },
  water: { label: '물·시냇물', family: 'water', root: '졸졸', variants: [W('졸졸', 'Y', '평', 2), W('쫄쫄', 'Y', '경', 2), W('줄줄', 'E', '평', 2), W('콸콸', 'Y', '격', 3), W('철철', 'E', '격', 3), W('퐁당', 'Y', '격', 1), W('풍덩', 'E', '격', 1)] },
  wind: { label: '바람', family: 'life', root: '살랑', variants: [W('살랑', 'Y', '평', 2), W('살랑살랑', 'Y', '평', 3), W('설렁', 'E', '평', 2), W('설렁설렁', 'E', '평', 3), W('쌩쌩', 'Y', '경', 2), W('씽씽', 'E', '경', 2), W('윙윙', 'E', '격', 2), W('휘잉', 'E', '격', 1)] },
  bird: { label: '새', family: 'animal', root: '짹짹', variants: [W('짹', 'Y', '경', 1), W('짹짹', 'Y', '경', 2), W('짹짹짹', 'Y', '경', 3)] },
  cat: { label: '고양이', family: 'animal', root: '야옹', variants: [W('냥', 'Y', '평', 1), W('애옹', 'Y', '평', 1), W('야옹', 'Y', '평', 2), W('야옹야옹', 'Y', '평', 3)] },
  dog: { label: '개', family: 'animal', root: '멍멍', variants: [W('멍', 'E', '평', 1), W('멍멍', 'E', '평', 2), W('멍멍멍', 'E', '평', 3), W('왕왕', 'Y', '평', 2), W('깽깽', 'Y', '경', 2), W('컹컹', 'E', '격', 2)] },
  footsteps: { label: '발소리', family: 'life', root: '또각', variants: [W('사뿐', 'Y', '평', 2), W('사뿐사뿐', 'Y', '평', 3), W('또각', 'Y', '경', 2), W('또각또각', 'Y', '경', 3), W('뚜벅', 'E', '경', 2), W('뚜벅뚜벅', 'E', '경', 3), W('터벅터벅', 'E', '격', 3), W('쿠당탕', 'E', '격', 2)] },
  typing: { label: '키보드', family: 'life', root: '톡톡', variants: [W('톡', 'Y', '격', 1), W('톡톡', 'Y', '격', 2), W('타닥', 'Y', '격', 2), W('타닥타닥', 'Y', '격', 3), W('딸깍', 'Y', '경', 1), W('따닥따닥', 'Y', '경', 3)] },
  frying: { label: '요리·튀김', family: 'life', root: '지글', variants: [W('지글', 'E', '평', 2), W('지글지글', 'E', '평', 3), W('자글자글', 'Y', '평', 3), W('치익', 'E', '격', 1), W('차르르', 'Y', '격', 2), W('찌직', 'E', '경', 2)] },
  dishes: { label: '그릇·수저', family: 'life', root: '달그락', variants: [W('달그락', 'Y', '평', 2), W('달그락달그락', 'Y', '평', 3), W('덜그럭', 'E', '평', 2), W('땡', 'Y', '경', 1), W('땡그랑', 'Y', '경', 2), W('탁', 'Y', '격', 1)] },
  vehicle: { label: '교통', family: 'life', root: '덜컥', variants: [W('붕', 'E', '평', 1), W('부릉', 'E', '평', 2), W('부릉부릉', 'E', '평', 3), W('빵빵', 'Y', '경', 2), W('덜컥', 'E', '격', 2), W('덜컹덜컹', 'E', '격', 3)] },
  applause: { label: '박수', family: 'life', root: '짝짝', variants: [W('짝', 'Y', '경', 1), W('짝짝', 'Y', '경', 2), W('짝짝짝', 'Y', '경', 3)] },
  laughter: { label: '웃음', family: 'laugh', root: '깔깔', variants: [W('호호', 'Y', '평', 2), W('하하', 'Y', '평', 2), W('허허', 'E', '평', 2), W('깔깔', 'Y', '경', 2), W('깔깔깔', 'Y', '경', 3), W('껄껄', 'E', '경', 2), W('킥킥', 'E', '격', 2), W('키득키득', 'E', '격', 3)] },
  singing: { label: '노래·허밍', family: 'voice', root: '흥얼', variants: [W('흥얼', 'E', '평', 2), W('흥얼흥얼', 'E', '평', 3), W('랄라', 'Y', '평', 2), W('랄랄라', 'Y', '평', 3), W('룰루', 'E', '평', 2)] },
  whisper: { label: '속삭임', family: 'voice', root: '소곤소곤', variants: [W('소곤소곤', 'Y', '평', 3), W('수군수군', 'E', '평', 3), W('쏙닥쏙닥', 'Y', '경', 3), W('쑥덕쑥덕', 'E', '경', 3)] },
  speech: { label: '말소리', family: 'voice', root: '도란도란', variants: [W('도란도란', 'Y', '평', 2), W('두런두런', 'E', '평', 2), W('재잘재잘', 'Y', '평', 3), W('조잘조잘', 'Y', '평', 3), W('쫑알쫑알', 'Y', '경', 3)] },
  other: { label: '그 밖의 소리', family: 'life', root: '사분사분', variants: [W('사분사분', 'Y', '평', 2), W('웅웅', 'E', '평', 2)] },
}

export const VOICE_CATEGORIES = ['speech', 'whisper', 'singing']

export const FAMILY_HUE = { water: 205, laugh: 48, voice: 335, animal: 28, life: 150 }
export const FAMILY_LABEL = { water: '물·비', laugh: '웃음', voice: '목소리', animal: '동물', life: '생활음' }

export function analyzeAxes({ rms, centroid, attack, onsets }) {
  const T = THRESHOLDS
  const loud = rms >= T.rmsLoud
  const bright = centroid >= T.centroidBright
  // 작고 밝으면 양성, 크고 낮으면 음성. 섞이면 어느 쪽에 더 치우쳤는지로 판단.
  const brightScore = Math.log2(Math.max(centroid, 1) / T.centroidBright)
  const loudScore = Math.log2(Math.max(rms, 1e-4) / T.rmsLoud)
  const vowel = brightScore - loudScore >= 0 ? 'Y' : 'E'
  const consonant = attack >= T.attackStrong ? '격' : attack >= T.attackMid ? '경' : '평'
  const rep = onsets <= 1 ? 1 : onsets <= 3 ? 2 : 3
  return { loud, bright, vowel, consonant, rep }
}

export function makeName(category, features) {
  const cat = CATEGORIES[category] || CATEGORIES.other
  const axes = analyzeAxes(features)
  let variants = cat.variants
  if (category === 'other') variants = [axes.loud ? variants[1] : variants[0]]
  // 말소리: 크고 onset 많으면 왁자지껄
  if (category === 'speech' && axes.loud && features.onsets >= 6) variants = [W('왁자지껄', 'Y', '경', 3)]

  let best = variants[0]
  let bestScore = -Infinity
  for (const w of variants) {
    let s = 0
    if (w.v === axes.vowel) s += 2
    if (w.r === axes.rep) s += 2
    else s -= Math.abs(w.r - axes.rep) * 0.5
    if (w.c === axes.consonant) s += 1
    if (w.n && w.n === features.onsets) s += 1.5
    if (w.word === cat.root) s += 0.3 // 동점이면 기본 어근
    if (s > bestScore) { bestScore = s; best = w }
  }
  return { word: best.word, name: `${best.word}꽃`, root: cat.root, axes, reason: makeReason(features, axes, best.word) }
}

function makeReason(f, axes, word) {
  const size = axes.loud ? '크고' : '작고'
  const tone = axes.bright ? '맑은' : '낮은'
  const vowel = axes.vowel === 'Y' ? '양성모음' : '음성모음'
  const cons = { 평: '부드럽게 시작해', 경: '또렷하게 시작해', 격: '세게 터져 나와' }[axes.consonant]
  const count = ['', '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열'][f.onsets] || `${f.onsets}`
  return `${size} ${tone} 소리라 ${vowel}, ${cons} ${count} 번 울려서 ${word}`
}

// 합성 꽃 이름: 각 어근의 첫 두 음절을 보낸 순서대로 잇는다. (토독 + 도란도란 = 토독도란꽃)
export function pairName(rootA, rootB) {
  return `${[...rootA].slice(0, 2).join('')}${[...rootB].slice(0, 2).join('')}꽃`
}

// 꽃 외형 파라미터 (PRD 4.4)
export function flowerLook(category, features, axes) {
  const family = (CATEGORIES[category] || CATEGORIES.other).family
  const hue = FAMILY_HUE[family] + Math.max(-15, Math.min(15, (features.centroid - 2200) / 150))
  const yang = axes.vowel === 'Y'
  const color = yang ? `hsl(${Math.round(hue)} 70% 80%)` : `hsl(${Math.round(hue)} 62% 52%)`
  const petals = Math.max(3, Math.min(8, features.onsets + 2))
  return { color, petals, family }
}
