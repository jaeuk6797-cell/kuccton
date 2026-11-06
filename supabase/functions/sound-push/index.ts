import { createClient } from 'npm:@supabase/supabase-js@2.45.0'
import webpush from 'npm:web-push@3.6.7'
import { validEndpoint, validHookSecret, validSubscription } from './validation.js'

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
}
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers })
const env = (name: string) => Deno.env.get(name) || ''
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})


async function deliver(shareId: string) {
  // 웹훅 본문에 있는 수신자·내용을 신뢰하지 않고 실제 DB 행을 다시 조회한다.
  const { data: share, error } = await admin.from('shares').select('id, to_user, status, created_at').eq('id', shareId).maybeSingle()
  if (error) throw error
  if (!share || share.status !== 'pending' || Date.now() - Date.parse(share.created_at) > 86400000) return reply({ sent: 0 })
  const { data: subscriptions, error: subscriptionError } = await admin.from('push_subscriptions').select('*').eq('user_id', share.to_user)
  if (subscriptionError) throw subscriptionError
  const results = await Promise.all((subscriptions || []).map(async (subscription) => {
    if (!validEndpoint(subscription.endpoint)) return false
    try {
      const details = webpush.generateRequestDetails({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, JSON.stringify({ shareId: share.id }), {
        TTL: 86400, urgency: 'normal',
        vapidDetails: { subject: env('VAPID_SUBJECT'), publicKey: env('VAPID_PUBLIC_KEY'), privateKey: env('VAPID_PRIVATE_KEY') },
      })
      const result = await fetch(subscription.endpoint, {
        method: 'POST', headers: details.headers, body: new Uint8Array(details.body!),
        redirect: 'error', signal: AbortSignal.timeout(10000),
      })
      await result.body?.cancel()
      if (result.status === 404 || result.status === 410) await admin.from('push_subscriptions').delete().eq('id', subscription.id)
      if (!result.ok && result.status !== 404 && result.status !== 410) console.error('SUP 푸시 제공자 응답:', result.status)
      return result.ok
    } catch {
      console.error('SUP 푸시 발송 실패')
      return false
    }
  }))
  return reply({ sent: results.filter(Boolean).length })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers })
  if (request.method !== 'POST') return reply({ error: 'METHOD_NOT_ALLOWED' }, 405)
  try {
    const body = await request.json()
    if (body.action === 'deliver') {
      if (!validHookSecret(request.headers.get('x-sup-push-secret'), env('PUSH_HOOK_SECRET'))) return reply({ error: 'UNAUTHORIZED' }, 401)
      if (typeof body.shareId !== 'string' || !/^[\da-f-]{36}$/i.test(body.shareId)) return reply({ error: 'BAD_SHARE' }, 400)
      return await deliver(body.shareId)
    }
    // verify_jwt=false라도 사용자 API는 실제 Supabase Auth로 JWT를 검증한다.
    const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
    if (!token) return reply({ error: 'UNAUTHORIZED' }, 401)
    const { data: { user }, error } = await admin.auth.getUser(token)
    if (error || !user || user.is_anonymous) return reply({ error: 'UNAUTHORIZED' }, 401)
    if (body.action === 'config') {
      if (!env('VAPID_PUBLIC_KEY') || !env('VAPID_PRIVATE_KEY') || !env('VAPID_SUBJECT') || env('PUSH_HOOK_SECRET').length < 32) return reply({ error: 'NOT_CONFIGURED' }, 503)
      const { error: dbError } = await admin.from('push_subscriptions').select('id').limit(0)
      if (dbError) return reply({ error: 'NOT_CONFIGURED' }, 503)
      return reply({ publicKey: env('VAPID_PUBLIC_KEY') })
    }
    if (body.action === 'subscribe') {
      const subscription = body.subscription
      if (!validSubscription(subscription)) return reply({ error: 'BAD_SUBSCRIPTION' }, 400)
      const { data: devices, error: devicesError } = await admin.from('push_subscriptions').select('endpoint').eq('user_id', user.id)
      if (devicesError) throw devicesError
      if ((devices || []).length >= 10 && !devices?.some((d) => d.endpoint === subscription.endpoint)) return reply({ error: 'TOO_MANY_DEVICES' }, 409)
      const { error: saveError } = await admin.from('push_subscriptions').upsert({
        user_id: user.id, endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, updated_at: new Date().toISOString(),
      }, { onConflict: 'endpoint' })
      if (saveError) throw saveError
      return reply({ ok: true })
    }
    if (body.action === 'unsubscribe') {
      if (!validEndpoint(body.endpoint)) return reply({ error: 'BAD_ENDPOINT' }, 400)
      const { error: deleteError } = await admin.from('push_subscriptions').delete().eq('endpoint', body.endpoint).eq('user_id', user.id)
      if (deleteError) throw deleteError
      return reply({ ok: true })
    }
    return reply({ error: 'BAD_ACTION' }, 400)
  } catch {
    console.error('SUP 푸시 요청 처리 실패')
    return reply({ error: 'PUSH_FAILED' }, 500)
  }
})
