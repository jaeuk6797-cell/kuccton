// 주소창·키보드·앱 복귀로 화면이 달라져도 실제 보이는 영역 안에 앱을 배치한다.
export function installViewport(win = window, doc = document) {
  const viewport = win.visualViewport
  let frame = 0
  let last = ''
  const measure = () => {
    frame = 0
    // 사용자의 확대 동작은 브라우저가 그대로 처리한다.
    if (viewport && Math.abs(viewport.scale - 1) > 0.01) return
    const standalone = win.navigator?.standalone === true || win.matchMedia?.('(display-mode: standalone)').matches
    const iphoneApp = standalone && /iPhone|iPod/.test(win.navigator?.userAgent || '')
    const landscape = win.screen?.orientation?.type?.startsWith('landscape') || Math.abs(win.orientation || 0) === 90
    const screenSides = [win.screen?.width || 0, win.screen?.height || 0]
    const fullHeight = iphoneApp ? (landscape ? Math.min(...screenSides) : Math.max(...screenSides)) : 0
    const layoutHeight = Math.max(fullHeight, win.innerHeight || 0, doc.documentElement.clientHeight || 0)
    const visibleHeight = viewport?.height || layoutHeight
    const editing = doc.activeElement?.matches('input, textarea, [contenteditable="true"]')
    const keyboardOpen = editing && layoutHeight - visibleHeight > 100
    if (!Number.isFinite(visibleHeight) || visibleHeight <= 0) return
    // 아이폰 홈 화면 앱은 주소창이 없는 화면 전체를 사용한다.
    // 일반 사파리의 주소창 영역과 입력 중 키보드 영역은 별도로 처리한다.
    const fullscreen = fullHeight > 0
    const explicitFrame = keyboardOpen || fullscreen
    const height = keyboardOpen ? `${visibleHeight}px` : fullscreen ? `${fullHeight}px` : '100dvh'
    const documentHeight = fullscreen ? `${fullHeight}px` : '100%'
    const top = keyboardOpen ? viewport?.offsetTop || 0 : 0
    const next = `${height}:${top}:${documentHeight}`
    if (last === next) return
    last = next
    doc.documentElement.style.setProperty('--viewport-height', height)
    doc.documentElement.style.setProperty('--viewport-top', `${top}px`)
    doc.documentElement.style.setProperty('--viewport-bottom', explicitFrame ? 'auto' : '0px')
    doc.documentElement.style.setProperty('--viewport-frame-height', explicitFrame ? height : 'auto')
    doc.documentElement.style.setProperty('--document-height', documentHeight)
  }
  const schedule = () => { if (!frame) frame = win.requestAnimationFrame(measure) }
  const onVisible = () => { if (doc.visibilityState === 'visible') schedule() }
  measure()
  win.addEventListener('resize', schedule)
  win.addEventListener('pageshow', schedule)
  win.addEventListener('orientationchange', schedule)
  viewport?.addEventListener('resize', schedule)
  viewport?.addEventListener('scroll', schedule)
  doc.addEventListener('visibilitychange', onVisible)
  doc.addEventListener('focusin', schedule)
  doc.addEventListener('focusout', schedule)
  return () => {
    win.cancelAnimationFrame(frame)
    win.removeEventListener('resize', schedule)
    win.removeEventListener('pageshow', schedule)
    win.removeEventListener('orientationchange', schedule)
    viewport?.removeEventListener('resize', schedule)
    viewport?.removeEventListener('scroll', schedule)
    doc.removeEventListener('visibilitychange', onVisible)
    doc.removeEventListener('focusin', schedule)
    doc.removeEventListener('focusout', schedule)
    doc.documentElement.style.removeProperty('--viewport-height')
    doc.documentElement.style.removeProperty('--viewport-top')
    doc.documentElement.style.removeProperty('--viewport-bottom')
    doc.documentElement.style.removeProperty('--viewport-frame-height')
    doc.documentElement.style.removeProperty('--document-height')
  }
}
