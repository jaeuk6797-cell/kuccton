// 소리숲 서비스 워커: 웹 푸시 알림만 다룬다 (캐시·오프라인 기능 없음)
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// 친구가 소리를 보내면 Edge Function(notify-share)이 보낸 알림을 띄운다
self.addEventListener('push', (event) => {
  let d = {}
  try { d = event.data ? event.data.json() : {} } catch { d = { body: event.data && event.data.text() } }
  event.waitUntil(
    self.registration.showNotification(d.title || '소리숲', {
      body: d.body || '새 소리가 도착했어요',
      icon: '/icon-192.png',
      tag: d.tag || 'inbox', // 여러 개 와도 알림 하나로 묶고
      renotify: true,        // 새로 올 때마다 다시 울린다
      data: { url: d.url || '/?inbox=1' },
    }),
  )
})

// 알림을 누르면: 열려 있는 소리숲 창이 있으면 받은 소리함을 열고, 없으면 새로 연다
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const w of wins) {
      if (new URL(w.url).origin !== self.location.origin) continue
      w.postMessage({ type: 'open-inbox' })
      return w.focus()
    }
    return self.clients.openWindow(url)
  })())
})
