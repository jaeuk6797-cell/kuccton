// 주소창·키보드·앱 복귀로 화면이 달라져도 실제 보이는 영역 안에 앱을 배치한다.
export function installViewport(win = window, doc = document) {
  const viewport = win.visualViewport
  let frame = 0
  let last = ''
  const measure = () => {
    frame = 0
    // 사용자의 확대 동작은 브라우저가 그대로 처리한다.
    if (viewport && Math.abs(viewport.scale - 1) > 0.01) return
    const height = viewport?.height || win.innerHeight
    const top = viewport?.offsetTop || 0
    if (!Number.isFinite(height) || height <= 0) return
    const next = `${height}:${top}`
    if (last === next) return
    last = next
    doc.documentElement.style.setProperty('--viewport-height', `${height}px`)
    doc.documentElement.style.setProperty('--viewport-top', `${top}px`)
  }
  const schedule = () => { if (!frame) frame = win.requestAnimationFrame(measure) }
  const onVisible = () => { if (doc.visibilityState === 'visible') schedule() }
  measure()
  win.addEventListener('resize', schedule)
  win.addEventListener('pageshow', schedule)
  viewport?.addEventListener('resize', schedule)
  viewport?.addEventListener('scroll', schedule)
  doc.addEventListener('visibilitychange', onVisible)
  return () => {
    win.cancelAnimationFrame(frame)
    win.removeEventListener('resize', schedule)
    win.removeEventListener('pageshow', schedule)
    viewport?.removeEventListener('resize', schedule)
    viewport?.removeEventListener('scroll', schedule)
    doc.removeEventListener('visibilitychange', onVisible)
    doc.documentElement.style.removeProperty('--viewport-height')
    doc.documentElement.style.removeProperty('--viewport-top')
  }
}
