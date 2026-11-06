import { createClient } from '@supabase/supabase-js'
import { pairName } from './naming.js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
export const configured = Boolean(url && key)
export const supabase = configured ? createClient(url, key) : null

const BUCKET = 'sounds'

// ───────── 계정 (이메일 + 비밀번호, 로그인 필수) ─────────

const errorText = (e) => {
  const m = e?.message || String(e)
  if (m.includes('GARDEN_NOT_FOUND')) return '그 코드의 정원을 찾지 못했어요.'
  if (m.includes('GARDEN_FULL')) return '이미 두 사람이 가꾸는 정원이에요.'
  if (m.includes('ALREADY_PAIRED')) return '이미 다른 친구와 함께 가꾸는 정원이 있어요.'
  if (m.includes('SELF_FRIEND')) return '내 코드예요. 친구의 코드를 넣어 주세요.'
  if (m.includes('NOT_AUTHENTICATED')) return '먼저 로그인해 주세요.'
  return m
}

const authErrorText = (e) => {
  const m = (e?.message || String(e)).toLowerCase()
  if (m.includes('invalid login credentials')) return '이메일 또는 비밀번호가 맞지 않아요.'
  if (m.includes('email not confirmed')) return '메일함에서 확인 링크를 먼저 눌러 주세요.'
  if (m.includes('already') && (m.includes('registered') || m.includes('exists'))) return '이미 가입된 이메일이에요. 로그인해 주세요.'
  if (m.includes('password') && m.includes('6')) return '비밀번호는 6자 이상이어야 해요.'
  if (m.includes('not authorized') || m.includes('sending') || m.includes('confirmation email')) return '확인 메일을 보내지 못했어요. 관리자에게 Supabase의 이메일 확인 설정을 확인해 달라고 해 주세요.'
  if (m.includes('invalid') && m.includes('email')) return '이메일 주소를 확인해 주세요.'
  if (m.includes('rate limit')) return '잠시 후 다시 시도해 주세요.'
  return e?.message || String(e)
}

/** 로그인한 사용자 (없으면 null). 예전에 쓰던 익명 세션은 로그아웃시킨다 */
export async function currentUser() {
  const { data } = await supabase.auth.getSession()
  const user = data.session?.user ?? null
  if (user?.is_anonymous) { await supabase.auth.signOut(); return null }
  return user
}

/** 로그인·로그아웃이 바뀔 때마다 cb(user | null) */
export function onAuthChange(cb) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    const u = session?.user ?? null
    cb(u && !u.is_anonymous ? u : null)
  })
  return () => data.subscription.unsubscribe()
}

export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error(authErrorText(error))
}

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw new Error(authErrorText(error))
  return { needsConfirm: !data.session }
}

export async function signOut() {
  await supabase.auth.signOut()
}

/** 로그인한 계정이 들어가 있는 가장 최근 정원 (없으면 null) */
export async function myLatestGarden() {
  const user = await currentUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('members')
    .select('id, garden_id, gardens(code)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw error
  if (!data?.length) return null
  return { gardenId: data[0].garden_id, memberId: data[0].id, code: data[0].gardens?.code }
}

export async function createGarden(nickname) {
  const { data, error } = await supabase.rpc('create_garden', { p_nickname: nickname })
  if (error) throw new Error(errorText(error))
  return data
}

export async function joinGarden(code, nickname) {
  const { data, error } = await supabase.rpc('join_garden', { p_code: code, p_nickname: nickname })
  if (error) throw new Error(errorText(error))
  return data
}

// ───────── 친구와 소리 공유 ─────────
// 각자 자기 정원을 갖고, 친구 코드(= 정원 코드)로 친구를 맺는다. 내 꽃을 골라 친구에게 공유하면
// 친구 정원 왼쪽에 핀다. 같은 날 서로 공유하면 두 정원 모두에 '우리의 꽃'이 핀다.

export async function addFriend(code) {
  const { data, error } = await supabase.rpc('add_friend', { p_code: code })
  if (error) throw new Error(errorText(error))
  return data // { user_id, nickname }
}

/** 꽃 여러 개 × 친구 여러 명을 한 번에 공유 (이미 공유한 조합은 건너뛴다) */
export async function shareFlowers(flowerIds, toUserIds) {
  const rows = flowerIds.flatMap((flower_id) => toUserIds.map((to_user) => ({ flower_id, to_user })))
  if (!rows.length) return
  const { error } = await supabase.from('shares').upsert(rows, { onConflict: 'flower_id,to_user', ignoreDuplicates: true })
  if (error) throw error
}

const localDate = (iso) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 우리의 꽃: 친구마다, 같은 날 내가 공유한 첫 꽃과 친구가 나에게 공유한 첫 꽃을 공유한 순서대로 잇는다
function derivePairs(friends, sent, received, flowerById) {
  const pairs = []
  for (const fr of friends) {
    const firstByDate = (list) => {
      const out = {}
      for (const s of [...list].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
        const d = localDate(s.created_at)
        if (!out[d] && flowerById[s.flower_id]) out[d] = s
      }
      return out
    }
    const mine = firstByDate(sent.filter((s) => s.to_user === fr.user_id))
    const theirs = firstByDate(received.filter((s) => s.from_user === fr.user_id))
    for (const date of Object.keys(mine)) {
      if (!theirs[date]) continue
      const [a, b] = [mine[date], theirs[date]].sort((x, y) => x.created_at.localeCompare(y.created_at))
      const fa = flowerById[a.flower_id], fb = flowerById[b.flower_id]
      pairs.push({ id: `pair-${fr.user_id}-${date}`, friend: fr.user_id, flower_a_id: fa.id, flower_b_id: fb.id, name: pairName(fa.root, fb.root), sent_date: date })
    }
  }
  return pairs.sort((a, b) => a.sent_date.localeCompare(b.sent_date))
}

export async function loadGarden(gardenId) {
  const user = await currentUser()
  const [g, m, f, fr, sent, recv] = await Promise.all([
    supabase.from('gardens').select('*').eq('id', gardenId).single(),
    supabase.from('members').select('*').eq('garden_id', gardenId).order('created_at'),
    supabase.from('flowers').select('*').eq('garden_id', gardenId).order('created_at'),
    supabase.rpc('my_friends'),
    supabase.from('shares').select('flower_id, to_user, created_at').eq('from_user', user.id),
    supabase.from('shares').select('flower_id, from_user, created_at, flower:flowers(*)').eq('to_user', user.id).order('created_at'),
  ])
  for (const r of [g, m, f, fr, sent, recv]) if (r.error) throw r.error

  const friends = fr.data
  // 받은 꽃은 내 정원 꽃과 함께 섬에 핀다 (보낸 친구는 sender_id로 구분)
  const own = f.data
  const ownIds = new Set(own.map((x) => x.id))
  const receivedFlowers = recv.data.filter((s) => s.flower && !ownIds.has(s.flower.id)).map((s) => ({ ...s.flower, shared_at: s.created_at }))
  const flowers = [...own, ...receivedFlowers]
  const flowerById = Object.fromEntries(flowers.map((x) => [x.id, x]))
  // 친구도 members 모양으로 넣어 두면 화면에서 보낸 사람 이름을 같은 방식으로 찾을 수 있다
  const friendMembers = friends.map((x) => ({ id: x.member_id, user_id: x.user_id, nickname: x.nickname, created_at: x.since, friend: true }))
  const members = [...m.data, ...friendMembers.filter((x) => !m.data.some((y) => y.id === x.id))]
  const received = recv.data.map(({ flower, ...s }) => s)
  return {
    garden: g.data, members, friends, flowers,
    sentShares: sent.data, receivedShares: received,
    pairs: derivePairs(friends, sent.data, received, flowerById),
    userId: user.id,
  }
}

export async function uploadAudio(gardenId, blob) {
  const ext = blob.type.includes('mp4') || blob.type.includes('aac') ? 'm4a' : 'webm'
  const path = `${gardenId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || 'audio/webm' })
  if (error) throw error
  return path
}

const urlCache = new Map()
export async function audioUrl(path) {
  const hit = urlCache.get(path)
  if (hit && hit.exp > Date.now()) return hit.url
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
  if (error) throw error
  urlCache.set(path, { url: data.signedUrl, exp: Date.now() + 50 * 60 * 1000 })
  return data.signedUrl
}

export async function insertFlower(row) {
  const { data, error } = await supabase.from('flowers').insert(row).select().single()
  if (error) throw error
  return data
}

export async function deleteFlower(flower) {
  const { error } = await supabase.from('flowers').delete().eq('id', flower.id)
  if (error) throw error
  await supabase.storage.from(BUCKET).remove([flower.audio_path])
}

export function subscribeGarden(gardenId, userId, onChange) {
  const filter = `garden_id=eq.${gardenId}`
  const ch = supabase
    .channel(`garden-${gardenId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'flowers', filter }, (e) => onChange('flower', e.new))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'flowers' }, () => onChange('delete'))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'shares', filter: `to_user=eq.${userId}` }, (e) => onChange('share', e.new))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => onChange('friend'))
    .subscribe()
  return () => supabase.removeChannel(ch)
}

export function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
