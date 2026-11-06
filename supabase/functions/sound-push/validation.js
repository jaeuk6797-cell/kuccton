import { timingSafeEqual } from 'node:crypto'

// 브라우저가 준 임의 URL로 서버가 요청하지 않도록 푸시 제공자만 허용한다.
export function validEndpoint(value) {
  if (typeof value !== 'string' || value.length > 4096) return false
  try {
    const url = new URL(value)
    const host = url.hostname
    const provider = host === 'fcm.googleapis.com'
      || host === 'updates.push.services.mozilla.com'
      || host === 'web.push.apple.com'
      || host.endsWith('.push.apple.com')
      || host.endsWith('.notify.windows.com')
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && provider
  } catch { return false }
}

export function validSubscription(value) {
  if (!validEndpoint(value?.endpoint)) return false
  const key = value?.keys
  // P-256 공개키는 65바이트, 인증 시크릿은 16바이트이다.
  return typeof key?.p256dh === 'string' && /^[A-Za-z0-9_-]{87}=?$/.test(key.p256dh)
    && typeof key?.auth === 'string' && /^[A-Za-z0-9_-]{22}(==)?$/.test(key.auth)
}

export function validHookSecret(given, expected) {
  if (typeof given !== 'string' || typeof expected !== 'string') return false
  const a = new TextEncoder().encode(expected), b = new TextEncoder().encode(given)
  return a.length >= 32 && a.length === b.length && timingSafeEqual(a, b)
}
