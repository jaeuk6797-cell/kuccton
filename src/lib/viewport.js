// 주소창·키보드·앱 복귀로 화면이 달라져도 실제 보이는 영역 안에 앱을 배치한다.
export function installViewport(win = window, doc = document) {
  const viewport = win.visualViewport
  let frame = 0
  let last = ''
  const measure = () => {
    frame = 0
    // 사용자의 확대 동작은 브라우저가 그대로 처리한다.
    if (viewport && Math.abs(viewport.scale - 1) > 0.01) return
    const layoutHeight = Math.max(win.innerHeight || 0, doc.documentElement.clientHeight || 0)
    const visibleHeight = viewport?.height || layoutHeight
    const editing = doc.activeElement?.matches('input, textarea, [contenteditable="true"]')
    const keyboardOpen = editing && layoutHeight - visibleHeight > 100
    if (!Number.isFinite(visibleHeight) || visibleHeight <= 0) return
    // 키보드가 없으면 CSS의 네 변 고정으로 화면을 채운다.
    // iOS 홈 화면의 innerHeight·visualViewport 수치를 앱 전체 높이로 쓰지 않는다.
    const height = keyboardOpen ? `${visibleHeight}px` : '100dvh'
    const top = keyboardOpen ? viewport?.offsetTop || 0 : 0
    const next = `${height}:${top}`
    if (last === next) return
    last = next
    doc.documentElement.style.setProperty('--viewport-height', height)
    doc.documentElement.style.setProperty('--viewport-top', `${top}px`)
    doc.documentElement.style.setProperty('--viewport-bottom', keyboardOpen ? 'auto' : '0px')
    doc.documentElement.style.setProperty('--viewport-frame-height', keyboardOpen ? height : 'auto')
  }
  const schedule = () => { if (!frame) frame = win.requestAnimationFrame(measure) }
  const onVisible = () => { if (doc.visibilityState === 'visible') schedule() }
  measure()
  win.addEventListener('resize', schedule)
  win.addEventListener('pageshow', schedule)
  viewport?.addEventListener('resize', schedule)
  viewport?.addEventListener('scroll', schedule)
  doc.addEventListener('visibilitychange', onVisible)
  doc.addEventListener('focusin', schedule)
  doc.addEventListener('focusout', schedule)
  return () => {
    win.cancelAnimationFrame(frame)
    win.removeEventListener('resize', schedule)
    win.removeEventListener('pageshow', schedule)
    viewport?.removeEventListener('resize', schedule)
    viewport?.removeEventListener('scroll', schedule)
    doc.removeEventListener('visibilitychange', onVisible)
    doc.removeEventListener('focusin', schedule)
    doc.removeEventListener('focusout', schedule)
    doc.documentElement.style.removeProperty('--viewport-height')
    doc.documentElement.style.removeProperty('--viewport-top')
    doc.documentElement.style.removeProperty('--viewport-bottom')
    doc.documentElement.style.removeProperty('--viewport-frame-height')
  }
}
