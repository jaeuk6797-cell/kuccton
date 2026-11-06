// 오프라인 캐시는 사용하지 않는다. 새 웹 배포를 가리지 않고 푸시만 처리한다.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let payload = {}
  try { payload = event.data?.json() || {} } catch { /* 내용이 없어도 도착 알림은 표시한다. */ }
  const shareId = typeof payload.shareId === 'string' && /^[\da-f-]{36}$/i.test(payload.shareId) ? payload.shareId : ''
  event.waitUntil(self.registration.showNotification('SUP', {
    body: '친구의 소리가 도착했어요. 정원에 심어 볼까요?',
    icon: new URL('icon-192.png', self.registration.scope).href,
    tag: shareId ? `sup-sound-${shareId}` : 'sup-sound',
    // 잠금 화면에 녹음 내용·꽃말·이메일을 노출하지 않는다.
    data: { inbox: true },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const destination = new URL('./?inbox=1', self.registration.scope).href
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = windows.find((client) => client.url.startsWith(self.registration.scope))
    if (existing) {
      const client = await existing.navigate(destination)
      return (client || existing).focus()
    }
    return self.clients.openWindow(destination)
  })())
})
