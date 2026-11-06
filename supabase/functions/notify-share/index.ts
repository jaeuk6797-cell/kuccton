// 소리 도착 알림: shares insert 트리거(migrations-009.sql)가 { share_id }로 부른다.
// 받는 사람이 알림을 켠 모든 기기로 웹 푸시를 보낸다.
//
// 비밀값 (Dashboard → Edge Functions → Secrets, 또는 supabase secrets set):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY  : npx web-push generate-vapid-keys 로 만든 한 쌍
//   PUSH_SECRET                          : Vault의 push_secret과 같은 값
//   VAPID_SUBJECT (선택)                 : 연락처 URL 또는 mailto:, 기본값은 배포 주소
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY는 Supabase가 자동으로 넣어 준다.
//
// 배포: JWT 검증을 끄고 배포한다 (트리거는 로그인 토큰 대신 x-push-secret으로 부른다)
//   supabase functions deploy notify-share --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const env = (k: string) => Deno.env.get(k) ?? ''

webpush.setVapidDetails(
  env('VAPID_SUBJECT') || 'https://kuccton.vercel.app',
  env('VAPID_PUBLIC_KEY'),
  env('VAPID_PRIVATE_KEY'),
)

const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
})

// 받침에 따라 조사 고르기 (앱의 Garden.jsx와 같은 규칙)
const hasBatchim = (w = '') => {
  const c = w.charCodeAt(w.length - 1)
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0
}
const josa = (w: string, a: string, b: string) => `${w}${hasBatchim(w) ? a : b}`

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })
  if (!env('PUSH_SECRET') || req.headers.get('x-push-secret') !== env('PUSH_SECRET')) {
    return new Response('forbidden', { status: 403 })
  }

  const { share_id } = await req.json().catch(() => ({}))
  if (!share_id) return new Response('share_id required', { status: 400 })

  const { data: share, error } = await db
    .from('shares')
    .select('id, to_user, status, flower:flowers(sender:members(nickname))')
    .eq('id', share_id)
    .maybeSingle()
  if (error) return new Response(error.message, { status: 500 })
  if (!share || share.status !== 'pending') return Response.json({ sent: 0 })

  const { data: subs, error: subErr } = await db
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', share.to_user)
  if (subErr) return new Response(subErr.message, { status: 500 })
  if (!subs?.length) return Response.json({ sent: 0 })

  // deno-lint-ignore no-explicit-any
  const sender: string = (share as any).flower?.sender?.nickname || '친구'
  const payload = JSON.stringify({
    title: '소리숲',
    body: `${josa(sender, '이', '가')} 소리를 보냈어요 · 받은 소리함에서 들어 보세요`,
    url: '/?inbox=1',
    tag: 'inbox',
  })

  let sent = 0
  const gone: string[] = []
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
        { TTL: 60 * 60 * 24, urgency: 'high' },
      )
      sent++
    } catch (e) {
      // deno-lint-ignore no-explicit-any
      const code = (e as any)?.statusCode
      if (code === 404 || code === 410) gone.push(s.endpoint) // 알림을 끈 기기·지운 앱
      else console.error('push failed', code, (e as Error)?.message)
    }
  }))
  if (gone.length) await db.from('push_subscriptions').delete().in('endpoint', gone)

  return Response.json({ sent, removed: gone.length })
})
