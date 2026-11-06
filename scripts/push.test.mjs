import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { validEndpoint, validHookSecret, validSubscription } from '../supabase/functions/sound-push/validation.js'

test('Apple·Google·Mozilla의 HTTPS 푸시만 허용하고 임의 서버 요청은 차단한다', () => {
  for (const endpoint of ['https://web.push.apple.com/token', 'https://fcm.googleapis.com/fcm/send/token', 'https://updates.push.services.mozilla.com/wpush/v2/token']) assert.equal(validEndpoint(endpoint), true)
  for (const endpoint of ['http://fcm.googleapis.com/token', 'https://fcm.googleapis.com.evil.test/token', 'https://127.0.0.1/token', 'https://user:pass@web.push.apple.com/token', 'https://web.push.apple.com:444/token', 'file:///etc/passwd']) assert.equal(validEndpoint(endpoint), false)
  const subscription = { endpoint: 'https://fcm.googleapis.com/token', keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) } }
  assert.equal(validSubscription(subscription), true)
  assert.equal(validSubscription({ ...subscription, keys: { ...subscription.keys, auth: 'bad' } }), false)
})

test('Pages 하위 경로에서 백그라운드 알림을 표시하고 받은 소리함으로 연다', async () => {
  const handlers = {}, notifications = [], navigations = []
  const self = {
    addEventListener(name, fn) { handlers[name] = fn },
    registration: { scope: 'https://example.test/kuccton/', showNotification: async (...args) => notifications.push(args) },
    clients: { matchAll: async () => [], openWindow: async (url) => navigations.push(url) },
  }
  vm.runInNewContext(await readFile(new URL('../public/sw.js', import.meta.url), 'utf8'), { self, URL })
  let completion
  const waitUntil = (promise) => { completion = promise }
  handlers.push({ data: { json: () => ({ shareId: '12345678-1234-1234-1234-123456789abc', url: 'https://evil.test' }) }, waitUntil })
  await completion
  assert.equal(notifications[0][0], 'SUP')
  assert.equal(notifications[0][1].icon, 'https://example.test/kuccton/icon-192.png')
  handlers.notificationclick({ notification: { close() {} }, waitUntil })
  await completion
  assert.deepEqual(navigations, ['https://example.test/kuccton/?inbox=1'])
  handlers.push({ data: { json() { throw new Error('잘못된 페이로드') } }, waitUntil })
  await completion
  assert.equal(notifications.length, 2)
})

test('DB 발송 웹훅은 충분히 긴 별도 비밀키가 정확히 일치할 때만 허용한다', () => {
  assert.equal(validHookSecret('', ''), false)
  assert.equal(validHookSecret('short', 'short'), false)
  assert.equal(validHookSecret('x'.repeat(64), 'y'.repeat(64)), false)
  assert.equal(validHookSecret(null, 'x'.repeat(64)), false)
  assert.equal(validHookSecret('x'.repeat(64), 'x'.repeat(64)), true)
})
