import webpush from 'npm:web-push@3.6.7'
import ece from 'npm:http_ece@1.2.0'
import { createECDH, randomBytes } from 'node:crypto'

Deno.test('Deno에서 Web Push 암호화 후 수신 기기 키로 원문을 복원한다', () => {
  const application = webpush.generateVAPIDKeys()
  const device = createECDH('prime256v1')
  device.generateKeys()
  const auth = randomBytes(16).toString('base64url')
  const message = JSON.stringify({ shareId: '12345678-1234-1234-1234-123456789abc' })
  const request = webpush.generateRequestDetails({
    endpoint: 'https://fcm.googleapis.com/fcm/send/test',
    keys: { p256dh: device.getPublicKey().toString('base64url'), auth },
  }, message, {
    TTL: 86400,
    vapidDetails: { subject: 'mailto:test@example.com', publicKey: application.publicKey, privateKey: application.privateKey },
  })
  const decoded = ece.decrypt(request.body, { version: 'aes128gcm', privateKey: device, authSecret: auth })
  if (decoded.toString() !== message) throw new Error('수신 기기에서 푸시를 복호화하지 못함')
  if (request.headers['Content-Encoding'] !== 'aes128gcm') throw new Error('표준 암호화가 아님')
  if (!String(request.headers.Authorization).startsWith('vapid ')) throw new Error('VAPID 인증 누락')
})
