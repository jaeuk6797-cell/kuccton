// 소리 도착 푸시 알림 (웹 푸시, Firebase 없이 Supabase Edge Function이 보냄)
// - 받는 곳: 아이폰은 '홈 화면에 추가'한 소리숲(iOS 16.4+), Android·PC는 크롬 등 브라우저
// - Capacitor 앱(WebView)은 웹 푸시를 지원하지 않아 제외한다
// 서버 쪽: supabase/migrations-009.sql, supabase/functions/notify-share
import { Capacitor } from '@capacitor/core'
import { supabase } from './db.js'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY
const SW_URL = '/sw.js'

const isNative = Capacitor.isNativePlatform()
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
const webPushAvailable = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

/** 배포에 공개 키가 설정돼 있어야 알림 기능을 보여 준다 */
export const pushConfigured = Boolean(VAPID_PUBLIC_KEY)

/** 앱 시작 시 서비스 워커 등록 (알림을 받으려면 필요) */
export function registerServiceWorker() {
  if (isNative || !pushConfigured || !('serviceWorker' in navigator)) return
  navigator.serviceWorker.register(SW_URL).catch((e) => console.warn('service worker', e))
}

/**
 * 이 기기의 알림 상태
 * 'app'(Capacitor 앱이라 불가) | 'install'(아이폰: 홈 화면에 추가해야 함) | 'unsupported'
 * | 'denied'(사용자가 차단) | 'on' | 'off'
 */
export async function pushStatus() {
  if (isNative) return 'app'
  if (!webPushAvailable()) return isIOS() && !isStandalone() ? 'install' : 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const sub = await currentSubscription()
  return sub && Notification.permission === 'granted' ? 'on' : 'off'
}

async function currentSubscription() {
  const reg = await navigator.serviceWorker.getRegistration(SW_URL)
  return reg ? reg.pushManager.getSubscription() : null
}

async function save(sub) {
  const { endpoint, keys } = sub.toJSON()
  const { error } = await supabase.rpc('save_push_subscription', { p_endpoint: endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth })
  if (error) throw error
}

/** 알림 켜기: 버튼을 누른 순간에 불러야 한다 (아이폰은 사용자 동작 안에서만 권한을 물을 수 있음) */
export async function enablePush() {
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error(perm === 'denied' ? '알림이 차단되어 있어요. 기기 설정에서 소리숲 알림을 허용해 주세요.' : '알림을 허용하지 않았어요.')
  await navigator.serviceWorker.register(SW_URL)
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription())
    || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(VAPID_PUBLIC_KEY) }))
  await save(sub)
}

/** 알림 끄기 (로그아웃할 때도 불러서 다음 사람이 이전 계정 알림을 받지 않게) */
export async function disablePush() {
  if (isNative || !webPushAvailable()) return
  const sub = await currentSubscription()
  if (!sub) return
  await supabase.rpc('delete_push_subscription', { p_endpoint: sub.endpoint }).then(({ error }) => error && console.warn(error))
  await sub.unsubscribe()
}

/** 로그인할 때마다: 이미 켜 둔 기기라면 구독을 지금 계정으로 다시 저장 (구독 주소가 바뀌었을 수도 있음) */
export async function syncPush() {
  if (isNative || !pushConfigured || !webPushAvailable() || Notification.permission !== 'granted') return
  const sub = await currentSubscription()
  if (sub) await save(sub).catch((e) => console.warn('push sync', e))
}

/** 알림을 눌러 앱이 열렸을 때 받은 소리함을 열기: ?inbox=1 로 열리거나, 열린 창에 서비스 워커가 메시지를 보낸다 */
export function onOpenInbox(cb) {
  const params = new URLSearchParams(location.search)
  if (params.has('inbox')) {
    params.delete('inbox')
    const q = params.toString()
    history.replaceState(null, '', location.pathname + (q ? `?${q}` : '') + location.hash)
    cb()
  }
  if (!('serviceWorker' in navigator)) return () => {}
  const onMsg = (e) => { if (e.data?.type === 'open-inbox') cb() }
  navigator.serviceWorker.addEventListener('message', onMsg)
  return () => navigator.serviceWorker.removeEventListener('message', onMsg)
}

function base64UrlToBytes(s) {
  const b64 = (s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}
