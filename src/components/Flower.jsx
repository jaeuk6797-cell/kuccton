import { useId } from 'react'
import Tree from './Tree.jsx'
import { isTree } from '../lib/tree.js'

// 2D SVG 꽃 (앨범·알림·입장 화면처럼 작게 여러 개 그릴 때). 3D 꽃(lib/flower3d.js)과 같은 규칙으로 그린다.
//  - 겹 수: 양성모음 2겹 / 음성모음 3겹 (안쪽 겹은 작고 엇갈림)
//  - 경음·격음: 끝이 뾰족한 꽃잎 / onset → 꽃잎 수(3~8) / 음량 → 크기
//  - lengths: 꽃잎별 길이 = 시간에 따른 소리 크기(파형 윤곽), 바깥 겹에서 가장 뚜렷
//  - 꽃잎은 밑동이 옅고 끝으로 갈수록 진해지며, 가운데는 은은하게 빛난다
//  - 사물 소리는 꽃 대신 나무(Tree.jsx)

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))

function petalPath(len, w, pointed) {
  if (pointed) return `M0 0 C ${w} ${-len * 0.35}, ${w * 0.55} ${-len * 0.82}, 0 ${-len} C ${-w * 0.55} ${-len * 0.82}, ${-w} ${-len * 0.35}, 0 0 Z`
  return `M0 0 C ${w * 1.05} ${-len * 0.25}, ${w * 1.05} ${-len}, 0 ${-len} C ${-w * 1.05} ${-len}, ${-w * 1.05} ${-len * 0.25}, 0 0 Z`
}

export default function Flower({ flower, colors, size = 96, stem = true, bloom = true, glow = false, mine }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  // 사물 소리는 꽃 대신 나무 (우리의 꽃처럼 colors가 있으면 꽃 그대로). 훅(useId)보다 뒤에서 분기한다
  if (isTree(flower) && !colors) return <Tree flower={flower} size={size} stem={stem} bloom={bloom} glow={glow} />
  const petals = clamp(Math.round(flower.petals || 5), 3, 8)
  const yang = flower.vowel !== 'E'
  const layers = yang ? 2 : 3
  const pointed = flower.consonant === '경' || flower.consonant === '격'
  const loud = clamp((flower.rms || 0.04) / 0.12, 0, 1)
  const baseLen = (yang ? 30 : 38) * (0.8 + loud * 0.3)
  const palette = colors || [flower.color || 'hsl(130 60% 70%)']
  const centerR = 5 + 3 * (0.8 + loud * 0.3)

  return (
    <svg
      className={`flower ${bloom ? 'bloom' : ''} ${glow ? 'glow' : ''}`}
      viewBox={stem ? '-50 -50 100 150' : '-50 -50 100 100'}
      width={size}
      height={stem ? size * 1.5 : size}
      aria-hidden="true"
    >
      <defs>
        {palette.map((c, k) => (
          <radialGradient key={k} id={`${uid}p${k}`} gradientUnits="userSpaceOnUse" cx="0" cy="0" r={baseLen}>
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.25" stopColor={c} stopOpacity="0.55" />
            <stop offset="0.9" stopColor={c} />
          </radialGradient>
        ))}
        <radialGradient id={`${uid}c`}>
          <stop offset="0" stopColor="#fffbe6" />
          <stop offset="0.6" stopColor="#fff1a8" />
          <stop offset="1" stopColor="#ffd86b" stopOpacity="0" />
        </radialGradient>
      </defs>

      {stem && (
        <g className="stem">
          <path d="M0 6 C 4 40, -4 70, 0 100" stroke="#6f9a5b" strokeWidth="3.5" fill="none" strokeLinecap="round" />
          <path d="M0 62 C 12 52, 22 54, 26 60 C 18 66, 8 66, 0 62 Z" fill="#88b46f" />
          {mine !== undefined && <circle cx="0" cy="100" r="4" fill={mine ? 'var(--mine)' : 'var(--theirs)'} />}
        </g>
      )}

      <g className="head">
        {Array.from({ length: layers }, (_, i) => {
          const len = baseLen * (1 - i * 0.22)
          const w = len * (pointed ? 0.3 : 0.4) * (6 / Math.max(petals, 4)) ** 0.3
          return (
            <g key={i} transform={`rotate(${(180 / petals) * i})`} opacity={1 - i * 0.08}>
              {Array.from({ length: petals }, (_, j) => {
                const L = clamp(flower.lengths?.[j] ?? 1, 0.4, 1.6)
                const k = j % palette.length
                return (
                  <g key={j} transform={`rotate(${(360 / petals) * j})`}>
                    <path
                      className="petal"
                      style={{ '--i': i * petals + j }}
                      d={petalPath(len * (1 + (L - 1) * (1 - i * 0.35)), w, pointed)}
                      fill={`url(#${uid}p${k})`}
                      stroke="rgba(0,0,0,.06)"
                      strokeWidth="0.6"
                    />
                  </g>
                )
              })}
            </g>
          )
        })}
        <circle r={centerR * 1.7} fill={`url(#${uid}c)`} className="center" />
        <circle r={centerR} fill="#fff6cf" className="center" />
      </g>
    </svg>
  )
}
