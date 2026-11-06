// 프로필 동그라미: 사진이 있으면 사진, 없으면 이름 첫 글자 (나는 '나')
export default function Avatar({ name, url, me = false, className = '' }) {
  const label = me ? '나' : name ? [...name][0] : '?'
  return (
    <span className={`av ${me ? 'me' : 'partner'} ${className}`.trim()}>
      {url ? <img src={url} alt="" draggable="false" /> : label}
    </span>
  )
}
