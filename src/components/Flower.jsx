import Tree from './Tree.jsx'
import { isTree } from '../lib/tree.js'

// 파라미터로 꽃잎을 만드는 SVG 꽃 (PRD 4.4)
// 양성모음: 작고 둥근 꽃잎·파스텔 / 음성모음: 크고 넓은 꽃잎·진한 톤 / 경음·격음: 끝이 뾰족 / onset → 꽃잎 수
// lengths: 꽃잎별 길이 배율 = 시간에 따른 소리 크기(파형 윤곽). 앞 꽃잎이 소리의 처음, 뒤 꽃잎이 끝
function petalPath(len, w, pointed) {
  if (pointed) return `M0 0 C ${w} ${-len * 0.35}, ${w * 0.55} ${-len * 0.82}, 0 ${-len} C ${-w * 0.55} ${-len * 0.82}, ${-w} ${-len * 0.35}, 0 0 Z`
  return `M0 0 C ${w * 1.05} ${-len * 0.25}, ${w * 1.05} ${-len}, 0 ${-len} C ${-w * 1.05} ${-len}, ${-w * 1.05} ${-len * 0.25}, 0 0 Z`
}

export default function Flower({ flower, colors, size = 96, stem = true, bloom = true, glow = false, mine }) {
  // 사물 소리는 꽃 대신 나무 (우리의 꽃처럼 colors가 있으면 꽃 그대로)
  if (isTree(flower) && !colors) return <Tree flower={flower} size={size} stem={stem} bloom={bloom} glow={glow} />
  const petals = flower.petals || 5
  const yang = flower.vowel !== 'E'
  const pointed = flower.consonant === '경' || flower.consonant === '격'
  const loud = Math.min(1, Math.max(0, (flower.rms || 0.04) / 0.12))
  const scale = 0.8 + loud * 0.35
  const len = (yang ? 26 : 36) * scale
  const w = (yang ? 11 : 18) * scale * (6 / Math.max(petals, 4)) ** 0.4
  const palette = colors || [flower.color || 'hsl(130 60% 70%)']
  const center = yang ? '#fff6d6' : '#5b4636'

  return (
    <svg
      className={`flower ${bloom ? 'bloom' : ''} ${glow ? 'glow' : ''}`}
      viewBox={stem ? '-50 -50 100 150' : '-50 -50 100 100'}
      width={size}
      height={stem ? size * 1.5 : size}
      aria-hidden="true"
    >
      {stem && (
        <g className="stem">
          <path d="M0 6 C 4 40, -4 70, 0 100" stroke="#6f9a5b" strokeWidth="3.5" fill="none" strokeLinecap="round" />
          <path d="M0 62 C 12 52, 22 54, 26 60 C 18 66, 8 66, 0 62 Z" fill="#88b46f" />
          {mine !== undefined && <circle cx="0" cy="100" r="4" fill={mine ? '#e9846b' : '#6b8fe9'} />}
        </g>
      )}
      <g className="head">
        {Array.from({ length: petals }, (_, i) => (
          <g key={i} transform={`rotate(${(360 / petals) * i})`}>
            <path
              className="petal"
              style={{ '--i': i }}
              d={petalPath(len * (flower.lengths?.[i] ?? 1), w, pointed)}
              fill={palette[i % palette.length]}
              stroke="rgba(0,0,0,.08)"
              strokeWidth="0.8"
            />
          </g>
        ))}
        <circle r={yang ? 7 : 9} fill={center} className="center" />
      </g>
    </svg>
  )
}
