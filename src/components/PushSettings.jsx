import { useEffect, useRef, useState } from 'react'
import { Bell } from './Icons.jsx'
import { disablePush, preparePush, pushSupport, savePushSubscription } from '../lib/push.js'

export default function PushSettings({ demo = false, variant = 'settings', onStatusChange }) {
  const support = pushSupport()
  const [enabled, setEnabled] = useState(false)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const prepared = useRef(null)

  useEffect(() => {
    if (demo || support !== 'supported') return
    let active = true
    preparePush().then(async (value) => {
      if (!active) return
      prepared.current = value
      const existing = await value.registration.pushManager.getSubscription()
      if (!active) return
      if (existing && Notification.permission === 'granted') {
        // 같은 기기에서 계정을 바꾼 경우 현재 로그인 계정에 다시 연결한다.
        await savePushSubscription(existing)
        if (active) { setEnabled(true); onStatusChange?.(true) }
      }
      if (active) setReady(true)
    }).catch(() => { if (active) setMessage('알림 기능을 준비하고 있어요.') })
    return () => { active = false }
  }, [demo, support, onStatusChange])

  async function toggle() {
    if (busy || !prepared.current) return
    setBusy(true); setMessage('')
    let created = null
    try {
      if (enabled) {
        await disablePush(prepared.current.registration)
        setEnabled(false)
        onStatusChange?.(false)
      } else {
        // iOS는 버튼을 누른 사용자 동작 안에서 즉시 구독을 요청해야 한다.
        created = await prepared.current.registration.pushManager.subscribe({
          userVisibleOnly: true, applicationServerKey: prepared.current.key,
        })
        await savePushSubscription(created)
        setEnabled(true)
        onStatusChange?.(true)
      }
    } catch {
      if (created) await created.unsubscribe().catch(() => {})
      setMessage(Notification.permission === 'denied'
        ? '기기 설정에서 SUP 알림을 허용해 주세요.'
        : '알림을 연결하지 못했어요. 다시 시도해 주세요.')
    } finally { setBusy(false) }
  }

  const hint = demo ? '실제 계정에서 알림을 설정할 수 있어요.'
    : support === 'install' ? '홈 화면에 추가한 SUP에서 알림을 켤 수 있어요.'
      : support === 'unsupported' ? '이 환경은 도착 알림을 지원하지 않아요.' : message
  const tutorial = variant === 'tutorial'
  const button = <button className={tutorial ? 'primary wide' : 'push-toggle'} aria-pressed={enabled}
    disabled={!ready || busy || demo || (tutorial && enabled)} onClick={toggle}>
    {busy ? '연결 중…' : enabled ? tutorial ? '알림이 켜졌어요' : '끄기' : tutorial ? '알림 켜기' : '켜기'}
  </button>
  return (
    <div className={`push-settings${tutorial ? ' tutorial-push-settings' : ''}`}>
      {tutorial ? button : <div className="push-settings-row">
        <span><Bell width={18} height={18} aria-hidden="true" />소리 도착 알림</span>
        {button}
      </div>}
      {hint && <p className="small muted" role="status">{hint}</p>}
    </div>
  )
}
