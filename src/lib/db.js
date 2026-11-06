import { createClient } from '@supabase/supabase-js'
import { pairName } from './naming.js'
import { receivedSoundCollections } from './receivedSounds.js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
export const configured = Boolean(url && key)
export const supabase = configured ? createClient(url, key) : null

const BUCKET = 'sounds'
export const FRIEND_LIMIT = 20
/** 정원에 심을 수 있는 최대 소리 수 (DB의 respond_share와 같아야 한다) */
export const GARDEN_LIMIT = 50
export const GARDEN_NEAR_FULL = 45

// ───────── 계정 (이메일 + 비밀번호, 로그인 필수) ─────────

const errorText = (e) => {
  const m = e?.message || String(e)
  if (m.includes('GARDEN_NOT_FOUND')) return '그 코드의 정원을 찾지 못했어요.'
  if (m.includes('GARDEN_FULL_50')) return `정원이 가득 찼어요(${GARDEN_LIMIT}송이). 정리한 뒤에 심어 주세요.`
  if (m.includes('GARDEN_FULL')) return '이미 두 사람이 가꾸는 정원이에요.'
  if (m.includes('ALREADY_PAIRED')) return '이미 다른 친구와 함께 가꾸는 정원이 있어요.'
  if (m.includes('FRIEND_LIMIT_SELF')) return `친구는 최대 ${FRIEND_LIMIT}명까지 맺을 수 있어요.`
  if (m.includes('FRIEND_LIMIT_OTHER')) return '상대방의 친구가 20명이라 지금은 친구를 맺을 수 없어요.'
  if (m.includes('SELF_FRIEND')) return '내 코드예요. 친구의 코드를 넣어 주세요.'
  if (m.includes('SHARE_NOT_FOUND')) return '이미 처리한 소리예요.'
  if (m.includes('NOT_AUTHENTICATED')) return '먼저 로그인해 주세요.'
  if (m.includes('BAD_NICKNAME')) return '닉네임은 1~12자로 적어 주세요.'
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

/** 정원 정리: 심은 소리를 정원에서 뺀다 (앨범에는 남는다) */
export async function archiveShares(shareIds) {
  const { data, error } = await supabase.rpc('archive_shares', { p_ids: shareIds })
  if (error) throw new Error(errorText(error))
  return data
}

/** 공유받은 소리를 정원에 심을지(true) 말지(false) */
export async function respondShare(shareId, accept) {
  const { error } = await supabase.rpc('respond_share', { p_share_id: shareId, p_accept: accept })
  if (error) throw new Error(errorText(error))
}

// ───────── 친구와 대화 ─────────
// 대화창 = 메시지 + 서로 주고받은 소리 공유를 시간순으로. 공유하면 대화에 자동으로 나온다.

/** 친구와의 대화: [{ type: 'text', ... } | { type: 'sound', flower, status, ... }] (오래된 순) */
export async function loadChat(friendUserId) {
  const user = await currentUser()
  const me = user.id
  const pairOr = `and(from_user.eq.${me},to_user.eq.${friendUserId}),and(from_user.eq.${friendUserId},to_user.eq.${me})`
  const [m, sh] = await Promise.all([
    supabase.from('messages').select('*').or(pairOr).order('created_at'),
    supabase.from('shares').select('id, flower_id, from_user, to_user, status, created_at, flower:flowers(*)').or(pairOr).order('created_at'),
  ])
  if (m.error) throw m.error
  if (sh.error) throw sh.error
  const items = [
    ...m.data.map((x) => ({ type: 'text', id: `m-${x.id}`, mine: x.from_user === me, body: x.body, created_at: x.created_at })),
    ...sh.data.filter((x) => x.flower).map((x) => ({
      type: 'sound', id: `s-${x.id}`, mine: x.from_user === me, status: x.status, created_at: x.created_at,
      flower: { ...x.flower, share_id: x.from_user === me ? undefined : x.id, from_user: x.from_user },
    })),
  ]
  return items.sort((a, b) => a.created_at.localeCompare(b.created_at))
}

export async function sendMessage(toUser, body) {
  const { error } = await supabase.from('messages').insert({ to_user: toUser, body })
  if (error) throw error
}

/** 대화창이 열려 있는 동안: 새 메시지, 새 공유, 공유 응답이 오면 cb() */
export function subscribeChat(userId, cb) {
  const ch = supabase
    .channel(`chat-${userId}-${Math.random().toString(36).slice(2, 7)}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `to_user=eq.${userId}` }, cb)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'shares', filter: `to_user=eq.${userId}` }, cb)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'shares', filter: `from_user=eq.${userId}` }, cb)
    .subscribe()
  return () => supabase.removeChannel(ch)
}

/** 친구의 공개 정원에 놀러 가기: 친구가 직접 심은 소리만 */
// 친구 정원 놀러 가기: 그 친구가 받아서 심은 소리 (친구 자신이 보낸 소리는 친구 정원에 없다)
// 각 꽃에 sender_name(보낸 사람)이 붙어 온다. supabase/migrations-006.sql 의 visit_flowers 필요
export async function loadVisit(friend) {
  const { data, error } = await supabase.rpc('visit_flowers', { p_friend: friend.user_id })
  if (error) {
    if (error.code === 'PGRST202' || /visit_flowers/.test(error.message || '')) {
      throw new Error('서버 준비가 아직 안 됐어요 (Supabase에서 migrations-006~008.sql 실행 필요)')
    }
    throw error
  }
  return data
}

const localDate = (iso) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 우리의 꽃: 친구마다, 같은 날 내가 공유한 첫 꽃과 친구가 나에게 공유한 첫 꽃을 공유한 순서대로 잇는다
export function derivePairs(friends, sent, received, flowerById) {
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

// ───────── 프로필 (닉네임·사진, migrations-009) ─────────

const AVATARS = 'avatars'

/** 사진을 가운데 정사각형으로 잘라 256px JPEG로 줄인다 (용량을 작게) */
async function squareJpeg(file, size = 256) {
  const bmp = await createImageBitmap(file)
  const s = Math.min(bmp.width, bmp.height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  canvas.getContext('2d').drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size)
  bmp.close?.()
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('사진을 읽지 못했어요.'))), 'image/jpeg', 0.85))
}

/** 닉네임과 프로필 사진 바꾸기. photo: File(새 사진) | null(그대로) | 'remove'(지우기) */
export async function updateProfile(nickname, photo = null) {
  const user = await currentUser()
  if (!user) throw new Error('먼저 로그인해 주세요.')
  let avatarUrl = null
  if (photo === 'remove') avatarUrl = ''
  else if (photo) {
    const blob = await squareJpeg(photo)
    const path = `${user.id}/${Date.now()}.jpg`
    const { error } = await supabase.storage.from(AVATARS).upload(path, blob, { contentType: 'image/jpeg' })
    if (error) throw new Error(/bucket/i.test(error.message) ? '프로필 사진 저장소가 아직 없어요 (Supabase에서 migrations-009.sql 실행 필요).' : error.message)
    avatarUrl = supabase.storage.from(AVATARS).getPublicUrl(path).data.publicUrl
  }
  const { error } = await supabase.rpc('update_profile', { p_nickname: nickname, p_avatar_url: avatarUrl })
  if (error) {
    if (/update_profile|function/i.test(error.message) && !/BAD_NICKNAME/.test(error.message)) throw new Error('프로필 기능이 아직 서버에 없어요 (Supabase에서 migrations-009.sql 실행 필요).')
    throw new Error(errorText(error))
  }
}

export async function loadGarden(gardenId) {
  const user = await currentUser()
  const [g, m, f, fr, sent, recv] = await Promise.all([
    supabase.from('gardens').select('*').eq('id', gardenId).single(),
    supabase.from('members').select('*').eq('garden_id', gardenId).order('created_at'),
    supabase.from('flowers').select('*').eq('garden_id', gardenId).order('created_at'),
    supabase.rpc('my_friends'),
    supabase.from('shares').select('id, flower_id, to_user, created_at, status').eq('from_user', user.id),
    supabase.from('shares').select('id, flower_id, from_user, created_at, status, flower:flowers(*)').eq('to_user', user.id).order('created_at'),
  ])
  for (const r of [g, m, f, fr, sent, recv]) if (r.error) throw r.error

  const friends = fr.data
  // 받은 꽃은 내 정원 꽃과 함께 섬에 핀다 (보낸 친구는 sender_id로 구분)
  const own = f.data
  const ownIds = new Set(own.map((x) => x.id))
  // 받기로 한 소리만 정원에 핀다. 아직 고르지 않은 소리는 받은 소리함(inbox)에 둔다
  const { receivedHistory, receivedFlowers, receivedShares: received, inbox } = receivedSoundCollections(
    recv.data.filter((s) => s.flower).map((s) => ({
      ...s.flower, share_id: s.id, share_status: s.status, shared_at: s.created_at, from_user: s.from_user,
    })),
  )
  const flowers = [...own, ...receivedFlowers.filter((f) => !ownIds.has(f.id))]
  const archived = receivedHistory.filter((f) => f.share_status === 'archived').map((f) => ({ ...f, archived: true }))
  const flowerById = Object.fromEntries(flowers.map((x) => [x.id, x]))
  // 친구도 members 모양으로 넣어 두면 화면에서 보낸 사람 이름을 같은 방식으로 찾을 수 있다
  const friendMembers = friends.map((x) => ({ id: x.member_id, user_id: x.user_id, nickname: x.nickname, avatar_url: x.avatar_url, created_at: x.since, friend: true }))
  const members = [...m.data, ...friendMembers.filter((x) => !m.data.some((y) => y.id === x.id))]
  return {
    garden: g.data, members, friends, flowers,
    sentShares: sent.data, receivedShares: received,
    inbox, receivedHistory,
    archived,
    // 우리의 꽃은 서로 받은 소리끼리만
    pairs: derivePairs(friends, sent.data.filter((x) => x.status === 'accepted'), received, flowerById),
    userId: user.id,
  }
}

export async function uploadAudio(gardenId, blob) {
  const ext = blob.type.includes('wav') ? 'wav' : blob.type.includes('mp4') || blob.type.includes('aac') ? 'm4a' : 'webm'
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

// 받은 항목만 삭제한다. 보낸 사람의 원본 꽃과 소리 파일은 건드리지 않는다.
export async function deleteReceivedSound(shareId) {
  const user = await currentUser()
  if (!user) throw new Error('먼저 로그인해 주세요.')
  const { data, error } = await supabase.from('shares').delete().eq('id', shareId).eq('to_user', user.id).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('삭제하지 못했어요. 서버에 migrations-012.sql이 적용되어 있는지 확인해 주세요.')
}

export function subscribeGarden(gardenId, userId, onChange) {
  const filter = `garden_id=eq.${gardenId}`
  const ch = supabase
    .channel(`garden-${gardenId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'flowers', filter }, (e) => onChange('flower', e.new))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'flowers' }, () => onChange('delete'))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'shares', filter: `to_user=eq.${userId}` }, (e) => onChange('share', e.new))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'shares', filter: `from_user=eq.${userId}` }, (e) => onChange('answered', e.new))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `to_user=eq.${userId}` }, (e) => onChange('message', e.new))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => onChange('friend'))
    .subscribe()
  return () => supabase.removeChannel(ch)
}

export function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
