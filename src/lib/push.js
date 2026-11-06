import { supabase } from './db.js'

export function pushSupport() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const installed = navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches
  if (ios && !installed) return 'install'
  return window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window ? 'supported' : 'unsupported'
}

async function invoke(body, timeout = 8000) {
  const { data, error } = await supabase.functions.invoke('sound-push', { body, signal: AbortSignal.timeout(timeout) })
  if (error) throw new Error('알림을 연결하지 못했어요. 잠시 후 다시 시도해 주세요.')
  return data
}

export async function preparePush() {
  const base = new URL(import.meta.env.BASE_URL, window.location.origin)
  const registration = await navigator.serviceWorker.register(new URL('sw.js', base), { scope: base.pathname })
  // ready는 이 페이지를 포함하는 같은 scope의 활성 워커를 기다린다.
  const ready = await navigator.serviceWorker.ready
  const config = await invoke({ action: 'config' })
  if (!config?.publicKey) throw new Error('알림 기능을 준비하고 있어요.')
  const key = Uint8Array.from(atob(config.publicKey.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
  return { registration: ready || registration, key }
}

export async function savePushSubscription(subscription) {
  await invoke({ action: 'subscribe', subscription: subscription.toJSON() })
}

export async function disablePush(registration) {
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return
  // 서버가 잠시 응답하지 않아도 이 기기로 오는 푸시는 즉시 중단한다.
  const endpoint = subscription.endpoint
  await subscription.unsubscribe()
  try { await invoke({ action: 'unsubscribe', endpoint }, 2500) } catch { /* 만료 구독은 다음 발송에서 410으로 정리된다. */ }
}

export async function clearPushForLogout() {
  if (!('serviceWorker' in navigator)) return
  const base = new URL(import.meta.env.BASE_URL, window.location.origin)
  const registration = await navigator.serviceWorker.getRegistration(base.href)
  await disablePush(registration)
}
