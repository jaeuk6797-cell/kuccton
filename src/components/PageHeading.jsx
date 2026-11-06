// 정원과 같은 위치에 서비스 이름과 페이지 제목을 표시한다.
export default function PageHeading({ children }) {
  return (
    <header className="page-heading">
      <span className="wordmark" aria-label="SUP">SUP</span>
      <h1 className="page-title">{children}</h1>
    </header>
  )
}
