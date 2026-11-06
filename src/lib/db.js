import { createClient } from '@supabase/supabase-js'
import { pairName } from './naming.js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
export const configured = Boolean(url && key)
export const supabase = configured ? createClient(url, key) : null

const BUCKET = 'sounds'
const SESSION_KEY = 'sup.session'

export async function ensureAuth() {
  const { data } = await supabase.auth.getSession()
  if (data.session) return data.session.user
  const { data: signed, error } = await supabase.auth.signInAnonymously()
  if (error) throw error
  return signed.user
}

export function savedSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)) } catch { return null }
}
export function saveSession(s) {
  if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s))
  else localStorage.removeItem(SESSION_KEY)
}

const errorText = (e) => {
  const m = e?.message || String(e)
  if (m.includes('GARDEN_NOT_FOUND')) return '그 코드의 정원을 찾지 못했어요.'
  if (m.includes('GARDEN_FULL')) return '이미 두 사람이 가꾸는 정원이에요.'
  if (m.toLowerCase().includes('anonymous')) return 'Supabase에서 익명 로그인을 켜 주세요.'
  return m
}

export async function createGarden(nickname) {
  await ensureAuth()
  const { data, error } = await supabase.rpc('create_garden', { p_nickname: nickname })
  if (error) throw new Error(errorText(error))
  return data
}

export async function joinGarden(code, nickname) {
  await ensureAuth()
  const { data, error } = await supabase.rpc('join_garden', { p_code: code, p_nickname: nickname })
  if (error) throw new Error(errorText(error))
  return data
}

export async function loadGarden(gardenId) {
  const [g, m, f, p] = await Promise.all([
    supabase.from('gardens').select('*').eq('id', gardenId).single(),
    supabase.from('members').select('*').eq('garden_id', gardenId).order('created_at'),
    supabase.from('flowers').select('*').eq('garden_id', gardenId).order('created_at'),
    supabase.from('pair_flowers').select('*').eq('garden_id', gardenId).order('created_at'),
  ])
  for (const r of [g, m, f, p]) if (r.error) throw r.error
  return { garden: g.data, members: m.data, flowers: f.data, pairs: p.data }
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

// 같은 날 두 사람이 모두 보냈는데 우리의 꽃이 없으면 만든다. (각자 그날의 첫 꽃끼리, 보낸 순서대로)
export async function ensurePairs({ garden, members, flowers, pairs }) {
  if (members.length < 2) return false
  const paired = new Set(pairs.map((p) => p.sent_date))
  const byDate = {}
  for (const f of flowers) (byDate[f.sent_date] ||= []).push(f)
  let created = false
  for (const [date, list] of Object.entries(byDate)) {
    if (paired.has(date)) continue
    const firsts = members.map((m) => list.find((f) => f.sender_id === m.id)).filter(Boolean)
    if (firsts.length < 2) continue
    firsts.sort((a, b) => a.created_at.localeCompare(b.created_at))
    const [a, b] = firsts
    const { error } = await supabase.from('pair_flowers').upsert(
      { garden_id: garden.id, flower_a_id: a.id, flower_b_id: b.id, name: pairName(a.root, b.root), sent_date: date },
      { onConflict: 'garden_id,sent_date', ignoreDuplicates: true },
    )
    if (error) console.warn('우리의 꽃 생성 실패', error)
    else created = true
  }
  return created
}

export function subscribeGarden(gardenId, onChange) {
  const filter = `garden_id=eq.${gardenId}`
  const ch = supabase
    .channel(`garden-${gardenId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'flowers', filter }, (e) => onChange('flower', e.new))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'flowers' }, () => onChange('delete'))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pair_flowers', filter }, (e) => onChange('pair', e.new))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'members', filter }, () => onChange('member'))
    .subscribe()
  return () => supabase.removeChannel(ch)
}

export function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
