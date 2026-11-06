// 사물 소리 나무 (2D SVG). 규칙은 lib/tree.js: 종류(활엽수·소나무·버드나무), 크기, 가지 수, 가지 길이(파형)
import { treeParams } from '../lib/tree.js'

const BROWN = '#7a5a43'

// 땅(y=100)에서 자라 올라가는 나무. 꽃의 줄기 있는 모양과 같은 좌표계(-50~50, 아래 100)를 쓴다.
export default function Tree({ flower, size = 96, stem = true, bloom = true, glow = false }) {
  const p = treeParams(flower)
  const len = (i) => p.lengths?.[i] ?? 1
  const H = 62 + 38 * Math.min(1, p.size) // 줄기 높이
  const top = 100 - H
  const trunkW = (3.2 + 2.2 * p.size) * (p.dark ? 1.3 : 1)
  const n = p.branches
  const fill = p.foliage

  let crown = null
  if (p.kind === 'pine') {
    // 소나무: 위로 갈수록 좁아지는 뾰족한 층. 층 수 = 가지 수, 층 너비 = 그 순간의 소리 크기
    const step = (H - 14) / (n + 0.4)
    crown = Array.from({ length: n }, (_, i) => {
      const yb = 88 - i * step
      const w = (24 + 14 * p.size) * (1 - i / (n + 1.2)) * (0.75 + 0.25 * len(i))
      return (
        <polygon
          key={i}
          points={`${-w},${yb} 0,${yb - step * 1.9} ${w},${yb}`}
          fill={fill}
          stroke="rgba(0,0,0,.12)"
          strokeWidth="0.8"
          strokeLinejoin="round"
          style={{ filter: `brightness(${0.92 + (i / n) * 0.2})` }}
        />
      )
    })
  } else if (p.kind === 'willow') {
    // 버드나무: 꼭대기에서 바깥으로 나갔다가 아래로 늘어지는 가지. 길이 = 소리 크기
    crown = (
      <>
        {Array.from({ length: n }, (_, i) => {
          const side = i % 2 ? 1 : -1
          const reach = (12 + 20 * p.size) * (0.55 + 0.45 * ((Math.floor(i / 2) + 1) / Math.ceil(n / 2)))
          const droop = (22 + 26 * p.size) * len(i)
          const x1 = side * reach
          const y0 = top + 6
          return (
            <g key={i}>
              <path
                d={`M0 ${y0} Q ${x1 * 0.9} ${y0 - 14} ${x1} ${y0 + 4} T ${x1 * 1.05} ${y0 + droop}`}
                stroke={fill}
                strokeWidth="2.4"
                fill="none"
                strokeLinecap="round"
              />
              {[0.45, 0.7, 1].map((t) => (
                <circle key={t} cx={x1 * (0.9 + 0.15 * t)} cy={y0 + 4 + (droop - 4) * t} r={2.6 + p.size} fill={fill} />
              ))}
            </g>
          )
        })}
        <ellipse cx="0" cy={top + 2} rx={9 + 5 * p.size} ry={7 + 3 * p.size} fill={fill} />
      </>
    )
  } else {
    // 활엽수: 줄기에서 번갈아 뻗는 가지 끝마다 잎 뭉치. 가지 길이 = 소리 크기
    crown = (
      <>
        {Array.from({ length: n }, (_, i) => {
          const side = i % 2 ? 1 : -1
          const t = 0.42 + 0.4 * (i / Math.max(n - 1, 1))
          const y0 = 100 - H * t
          const L = (16 + 14 * p.size) * (0.5 + 0.5 * len(i))
          const ang = ((28 + (i % 3) * 9) * Math.PI) / 180
          const x1 = side * Math.sin(ang) * L
          const y1 = y0 - Math.cos(ang) * L
          return (
            <g key={i}>
              <line x1="0" y1={y0} x2={x1} y2={y1} stroke={BROWN} strokeWidth={2 + p.size} strokeLinecap="round" />
              <circle cx={x1} cy={y1} r={(7 + 6 * p.size) * (0.7 + 0.3 * len(i))} fill={fill} stroke="rgba(0,0,0,.1)" strokeWidth="0.8" />
            </g>
          )
        })}
        <circle cx="0" cy={top} r={12 + 9 * p.size} fill={fill} stroke="rgba(0,0,0,.1)" strokeWidth="0.8" />
      </>
    )
  }

  return (
    <svg
      className={`tree ${bloom ? 'bloom' : ''} ${glow ? 'glow' : ''}`}
      viewBox={stem ? '-50 -50 100 150' : '-50 -36 100 100'}
      width={size}
      height={stem ? size * 1.5 : size}
      aria-hidden="true"
    >
      {stem && <ellipse cx="0" cy="101" rx="20" ry="3" fill="rgba(0,0,0,.12)" />}
      <path
        d={`M${-trunkW} 100 L${-trunkW * 0.55} ${top + 8} L${trunkW * 0.55} ${top + 8} L${trunkW} 100 Z`}
        fill={BROWN}
      />
      <g className="crown">{crown}</g>
    </svg>
  )
}
