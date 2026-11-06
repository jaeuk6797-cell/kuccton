// PRD 4.4: 꽃잎 수=onset 수, 크기=RMS, 끝이 뾰족한 꽃잎=경음·격음, 색=카테고리 계열
export default function FlowerPreview({ flower }) {
  const { petals, size, pointed, color, name, lengths } = flower // lengths: 꽃잎별 길이 배율(파형 윤곽)
  const width = pointed ? 14 : 22
  return (
    <svg viewBox="-100 -100 200 200" width={200} height={200} role="img" aria-label={name}>
      <g>
        {Array.from({ length: petals }, (_, i) => {
          const length = 70 * size * (lengths?.[i] ?? 1)
          return (
          <g key={i} transform={`rotate(${(360 / petals) * i})`}>
            {pointed ? (
              <path d={`M0 0 Q${width} ${-length * 0.5} 0 ${-length} Q${-width} ${-length * 0.5} 0 0Z`} fill={color} opacity="0.9" />
            ) : (
              <ellipse cx="0" cy={-length / 2} rx={width * size + 6} ry={length / 2} fill={color} opacity="0.9" />
            )}
          </g>
          )
        })}
        <circle r={10 + 6 * size} fill="#f6d365" />
      </g>
    </svg>
  )
}
