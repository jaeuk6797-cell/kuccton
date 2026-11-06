// 사물 소리는 꽃이 아니라 나무로 자란다. 2D(Tree.jsx)와 3D(tree3d.js)가 같은 규칙을 쓴다.
//  종류   : 길게 이어지는 소리 = 버드나무(늘어지는 가지) / 세게 터지는 소리 = 소나무(뾰족한 층) / 그 외 = 활엽수(퍼지는 가지)
//  크기   : 음량이 클수록 크고, 크고 낮은 소리(음성모음)는 더 굵다
//  가지 수: 소리 이벤트 수 (petals 3~8)
//  가지 길이: 시간에 따른 소리 크기(lengths, 파형 윤곽). 앞 가지가 소리의 처음, 뒤 가지가 끝
import { SUSTAINED_WORDS } from './flower.js'

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))

// 사물 소리는 flowers 행의 category가 'sound'
export const isTree = (f) => f?.category === 'sound'

export function treeParams(f) {
  const loud = clamp((f.rms ?? 0.04) / 0.12, 0, 1)
  const dark = f.vowel === 'E'
  const pointy = f.consonant === '경' || f.consonant === '격'
  const kind = SUSTAINED_WORDS.includes(f.root) ? 'willow' : pointy ? 'pine' : 'round'
  return {
    kind,
    branches: Math.round(clamp(f.petals ?? 5, 3, 8)),
    loud,
    dark,
    size: clamp((dark ? 0.85 : 0.6) * (0.9 + loud * 0.25) / 0.85, 0.5, 1.15), // 0.5(작은 소리) ~ 1.15(크고 낮은 소리)
    lengths: f.lengths ?? null,
    foliage: foliageColor(f),
  }
}

// 소리 밝기에서 온 색(파랑→주황)을 잎 색으로 반쯤만 옮긴다: 나무다운 초록빛에 소리의 느낌이 남는다
export function foliageColor(f) {
  const m = /hsl\(\s*([\d.]+)[\s,]+([\d.]+)%[\s,]+([\d.]+)%/.exec(f.color || '')
  const h = m ? +m[1] : 120
  const l = m ? clamp(+m[3], 36, 62) : 50
  return `hsl(${Math.round(110 + (h - 110) * 0.5)} 48% ${l}%)`
}
