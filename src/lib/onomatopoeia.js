// 의성어 꽃 이름 규칙 (PRD 4장)
// 카테고리 → 어근, 음향 특징 → 모음(bright/dark)·자음(plain/tense/aspirated)·반복(0:단일 1:기본 2:첩어)
// 실제로 쓰는 단어만 적고, 없는 칸은 가까운 형태로 대체한다.

export const CATEGORIES = {
  rain: {
    label: '비', zone: 'water', color: '#8EC5FF',
    forms: {
      bright: { plain: ['톡', '토독', '토독토독'] },
      dark: { plain: ['툭', '투둑', '투둑투둑'] },
    },
  },
  water: {
    label: '물', zone: 'water', color: '#6FD6E8',
    forms: {
      bright: { plain: ['졸졸', '졸졸', '졸졸졸졸'], tense: ['쫄쫄', '쫄쫄', '쫄쫄쫄쫄'] },
      dark: { plain: ['줄줄', '줄줄', '줄줄줄줄'], tense: ['쭐쭐', '쭐쭐', '쭐쭐쭐쭐'] },
    },
  },
  wind: {
    label: '바람', zone: 'hill', color: '#B9E4D0',
    forms: {
      bright: { plain: ['살랑', '살랑', '살랑살랑'] },
      dark: { plain: ['슬렁', '슬렁', '슬렁슬렁'], aspirated: ['휭', '휭휭', '휘잉'] },
    },
  },
  bird: {
    label: '새', zone: 'hill', color: '#FFE08A',
    forms: { bright: { tense: ['짹', '짹짹', '짹짹짹'] }, dark: { tense: ['찍', '찍찍', '찍찍찍'] } },
  },
  cat: {
    label: '고양이', zone: 'sunny', color: '#FFB86B',
    forms: { bright: { plain: ['야옹', '야옹', '야옹야옹'] }, dark: { plain: ['냐옹', '냐옹', '냐옹냐옹'] } },
  },
  dog: {
    label: '강아지', zone: 'sunny', color: '#F5A65B',
    forms: { bright: { plain: ['멍', '멍멍', '멍멍멍'] }, dark: { plain: ['컹', '컹컹', '컹컹컹'] } },
  },
  footsteps: {
    label: '발소리', zone: 'path', color: '#C8E6A0',
    forms: {
      bright: { tense: ['또각', '또각', '또각또각'] },
      dark: { plain: ['저벅', '저벅', '저벅저벅'], tense: ['뚜벅', '뚜벅', '뚜벅뚜벅'] },
    },
  },
  typing: {
    label: '키보드', zone: 'path', color: '#A9DCA0',
    forms: { bright: { plain: ['톡', '톡톡', '타닥타닥'] }, dark: { plain: ['툭', '툭툭', '투닥투닥'] } },
  },
  frying: {
    label: '요리', zone: 'path', color: '#FFC27A',
    forms: { bright: { plain: ['지글', '지글', '지글지글'], aspirated: ['치익', '치익', '치익치익'] }, dark: { plain: ['지글', '지글', '지글지글'] } },
  },
  dishes: {
    label: '그릇', zone: 'path', color: '#D6E7F5',
    forms: {
      bright: { plain: ['달그락', '달그락', '달그락달그락'], tense: ['땡', '땡그랑', '땡그랑땡그랑'] },
      dark: { plain: ['덜그럭', '덜그럭', '덜그럭덜그럭'] },
    },
  },
  vehicle: {
    label: '교통', zone: 'path', color: '#9FB4FF',
    forms: { bright: { plain: ['부릉', '부릉', '부릉부릉'] }, dark: { plain: ['덜컹', '덜컹', '덜컹덜컹'] } },
  },
  applause: {
    label: '박수', zone: 'sunny', color: '#FFD86B',
    forms: { bright: { tense: ['짝', '짝짝', '짝짝짝'] }, dark: { tense: ['짝', '짝짝', '짝짝짝'] } },
  },
  laughter: {
    label: '웃음', zone: 'sunny', color: '#FFE36B',
    forms: {
      bright: { plain: ['히히', '하하', '하하하'], tense: ['깔깔', '깔깔', '깔깔깔깔'], aspirated: ['킥킥', '킥킥', '킥킥킥'] },
      dark: { plain: ['허허', '허허', '허허허'], tense: ['껄껄', '껄껄', '껄껄껄껄'] },
    },
  },
  singing: {
    label: '노래', zone: 'shade', color: '#F7A8D8',
    forms: { bright: { plain: ['랄라', '랄라', '랄라랄라'] }, dark: { plain: ['흥얼', '흥얼', '흥얼흥얼'] } },
  },
  whisper: {
    label: '속삭임', zone: 'shade', color: '#F3C4E6',
    forms: { bright: { plain: ['소곤', '소곤소곤', '소곤소곤'] }, dark: { plain: ['수군', '수군수군', '수군수군'] } },
  },
  speech: {
    label: '목소리', zone: 'shade', color: '#FF9EC7',
    forms: {
      bright: { plain: ['도란', '도란도란', '재잘재잘'] },
      dark: { plain: ['두런', '두런두런', '왁자지껄'] },
    },
  },
  other: {
    label: '그 밖의 소리', zone: 'path', color: '#E0D4FF',
    forms: { bright: { plain: ['사분', '사분사분', '사분사분'] }, dark: { plain: ['웅', '웅웅', '웅웅웅'] } },
  },
}

export const VOICE_CATEGORIES = ['speech', 'whisper', 'singing']

// 해커톤 초반에 샘플 20개로 다시 잡을 임계값
export const THRESHOLDS = {
  loud: 0.08,        // 평균 RMS (0~1)
  bright: 2200,      // spectral centroid (Hz)
  tense: 0.35,       // 정규화된 어택
  aspirated: 0.65,
}

const ORDER = ['plain', 'tense', 'aspirated']

function pickForm(forms, vowel, consonant) {
  const byVowel = forms[vowel] || forms.bright || forms.dark
  if (byVowel[consonant]) return { list: byVowel[consonant], consonant }
  // 없는 자음 계열이면 가까운 쪽으로
  const idx = ORDER.indexOf(consonant)
  for (const d of [1, -1, 2, -2]) {
    const c = ORDER[idx + d]
    if (c && byVowel[c]) return { list: byVowel[c], consonant: c }
  }
  const first = Object.keys(byVowel)[0]
  return { list: byVowel[first], consonant: first }
}

export function featuresToPhonology(f) {
  const vowel = f.rms < THRESHOLDS.loud && f.centroid > THRESHOLDS.bright ? 'bright'
    : f.rms >= THRESHOLDS.loud && f.centroid <= THRESHOLDS.bright ? 'dark'
    : f.centroid > THRESHOLDS.bright ? 'bright' : 'dark'
  const consonant = f.attack >= THRESHOLDS.aspirated ? 'aspirated' : f.attack >= THRESHOLDS.tense ? 'tense' : 'plain'
  const rhythm = f.onsets <= 1 ? 0 : f.onsets <= 3 ? 1 : 2
  return { vowel, consonant, rhythm }
}

const VOWEL_TEXT = { bright: '작고 맑은 소리라 양성모음', dark: '크고 묵직한 소리라 음성모음' }
const CONS_TEXT = { plain: '부드럽게 시작해서 예사소리', tense: '또렷하게 시작해서 된소리', aspirated: '세게 터져서 거센소리' }
const RHYTHM_TEXT = ['한 번 울려서', '몇 번 이어져서', '여러 번 반복돼서']

export function nameFlower(category, features) {
  const cat = CATEGORIES[category] || CATEGORIES.other
  const ph = featuresToPhonology(features)
  const { list, consonant } = pickForm(cat.forms, ph.vowel, ph.consonant)
  const word = list[Math.min(ph.rhythm, list.length - 1)]
  const reason = `${VOWEL_TEXT[ph.vowel]}, ${CONS_TEXT[consonant]}, ${RHYTHM_TEXT[ph.rhythm]} '${word}'`
  return { word, name: `${word}꽃`, reason, phonology: { ...ph, consonant } }
}

// 합성 꽃 이름: 각 단어의 첫 반복 단위(최대 2음절)를 보낸 순서대로 잇는다
function unit(word) {
  const n = word.length
  if (n % 2 === 0 && n >= 4 && word.slice(0, n / 2) === word.slice(n / 2)) return word.slice(0, n / 2).slice(0, 2)
  return word.slice(0, 2)
}
export function pairName(wordA, wordB) {
  return `${unit(wordA)}${unit(wordB)}꽃`
}
