// 개발용: 실제 홈(Garden) 화면을 가짜 데이터로 보기. Supabase 계정·녹음 없이 화면만 확인한다.
//   npm run dev → /?view=home            꽃이 있는 정원 (친구 1명, 오늘 우리의 꽃까지)
//                 /?view=home&flowers=0  꽃이 하나도 없는 정원
//                 /?view=home&friends=3  친구 3명 (여러 친구 테스트, 최대 200명)
//                 /?view=home&friends=100&many=50&album=1000&tab=album
// 꽃 데이터는 실제 앱과 같은 규칙(flower.js → naming.js toFlowerRow)으로 만든다.
import Garden from '../components/Garden.jsx'
import { buildFlower, buildSoundFlower } from '../lib/flower.js'
import { toFlowerRow, pairName } from '../lib/naming.js'
import { receivedSoundCollections } from '../lib/receivedSounds.js'

const DAY = 86400000
const localDate = (t) => new Date(t).toLocaleDateString('sv-SE')
const iso = (t) => new Date(t).toISOString()

const ME = { member: 'me', user: 'u-me', name: '여정' }
const FRIEND = { member: 'm-jae', user: 'u-jae', name: '재욱' }
const MORE_FRIENDS = [
  { member: 'm-min', user: 'u-min', name: '민지' },
  { member: 'm-sky', user: 'u-sky', name: '하늘' },
  // 친구가 많을 때('+N' 버튼) 확인용
  { member: 'm-doy', user: 'u-doy', name: '도윤' },
  { member: 'm-seo', user: 'u-seo', name: '서연' },
  { member: 'm-jih', user: 'u-jih', name: '지호' },
  { member: 'm-sua', user: 'u-sua', name: '수아' },
  { member: 'm-jun', user: 'u-jun', name: '준서' },
  { member: 'm-yun', user: 'u-yun', name: '윤아' },
  { member: 'm-haj', user: 'u-haj', name: '하준' },
]

const VOICE = (category, f, transcript) => ({ kind: 'voice', category, f, transcript })
const SOUND = (f) => ({ kind: 'other', category: null, f, transcript: null })
const env = (...v) => v

let seq = 0
function flower(who, sample, time) {
  const { kind, category, f, transcript } = sample
  const built = kind === 'voice' ? buildFlower(category, f, 1) : buildSoundFlower(f)
  return {
    id: `demo-${seq++}`, garden_id: `g-${who.member}`, sender_id: who.member, audio_path: null,
    ...toFlowerRow({ flower: built, features: f, kind, category, transcript }),
    sent_date: localDate(time), created_at: iso(time),
  }
}

function makeData(withFlowers, friendCount = 1, albumCount = 0) {
  const now = Date.now()
  const friends = [{ member_id: FRIEND.member, user_id: FRIEND.user, nickname: FRIEND.name, since: iso(now - 3 * DAY), is_public: true }]
  const members = [
    { id: ME.member, user_id: ME.user, garden_id: 'g-me', nickname: ME.name, created_at: iso(now - 3 * DAY) },
    { id: FRIEND.member, user_id: FRIEND.user, nickname: FRIEND.name, created_at: iso(now - 3 * DAY), friend: true },
  ]
  // 친구 여러 명: 민지·하늘을 더한다
  const extra = Array.from({ length: Math.max(0, friendCount - 1) }, (_, i) => MORE_FRIENDS[i] || {
    member: `m-extra-${i}`, user: `u-extra-${i}`, name: `친구 ${String(i + 2).padStart(3, '0')}`,
  })
  for (const fr of extra) {
    friends.push({ member_id: fr.member, user_id: fr.user, nickname: fr.name, since: iso(now - 2 * DAY), is_public: fr.name === '민지' })
    members.push({ id: fr.member, user_id: fr.user, nickname: fr.name, created_at: iso(now - 2 * DAY), friend: true })
  }
  const base = { garden: { id: 'g-me', code: '123456', created_at: iso(now - 3 * DAY), is_public: false }, members, friends, userId: ME.user }
  if (!withFlowers) return { ...base, flowers: [], sentShares: [], receivedShares: [], receivedHistory: [], inbox: [], pairs: [] }

  const mine = [
    flower(ME, VOICE('joy', { rms: 0.09, centroid: 2500, attack: 0.55, onsets: 5, sustain: 0.4, envelope: env(1, 0.6, 0.9, 0.5, 0.8) }, '하하 오늘 진짜 웃겼어'), now - 2 * DAY),
    flower(ME, SOUND({ rms: 0.04, centroid: 3200, attack: 0.6, onsets: 3, sustain: 0.2, envelope: env(0.9, 0.3, 0.8, 0.2, 0.7) }), now - DAY),
    flower(ME, VOICE('calm', { rms: 0.05, centroid: 1800, attack: 0.2, onsets: 3, sustain: 0.7, envelope: env(0.6, 0.7, 0.6, 0.8) }, '잘 자'), now - 60 * 60000),
  ]
  const theirs = [
    flower(FRIEND, VOICE('flutter', { rms: 0.03, centroid: 2600, attack: 0.1, onsets: 3, sustain: 0.6, envelope: env(0.4, 0.6, 0.5, 0.7) }, '오늘도 고생했어'), now - 2 * DAY + 3600000),
    flower(FRIEND, SOUND({ rms: 0.12, centroid: 1100, attack: 0.3, onsets: 2, sustain: 0.3, envelope: env(1, 0.4, 0.9) }), now - DAY + 3600000),
    flower(FRIEND, VOICE('cozy', { rms: 0.03, centroid: 1700, attack: 0.1, onsets: 2, sustain: 0.8, envelope: env(0.5, 0.6, 0.5) }, '저녁 맛있게 먹어!'), now - 30 * 60000),
  ]
  // 다른 친구들이 보낸 소리 (민지: 오늘 하나 + 어제 하나, 하늘: 어제 하나)
  const extraTheirs = []
  if (extra[0]) {
    extraTheirs.push(flower(extra[0], VOICE('excited', { rms: 0.1, centroid: 2300, attack: 0.6, onsets: 5, sustain: 0.3, envelope: env(1, 0.7, 0.9, 0.6, 1) }, '오늘 대박이야!'), now - DAY + 7200000))
    extraTheirs.push(flower(extra[0], VOICE('sad', { rms: 0.03, centroid: 1500, attack: 0.1, onsets: 2, sustain: 0.7, envelope: env(0.5, 0.4, 0.5) }, '조금 지쳤어'), now - 20 * 60000))
  }
  if (extra[1]) {
    extraTheirs.push(flower(extra[1], SOUND({ rms: 0.03, centroid: 3600, attack: 0.1, onsets: 1, sustain: 0.9, envelope: env(0.5, 0.7, 0.8, 0.7) }), now - DAY + 10800000))
  }
  // 그 밖의 친구들: 며칠 전에 하나씩 (최근에 주고받은 순서가 뒤로 밀린다)
  extra.slice(2).forEach((fr, i) => {
    extraTheirs.push(flower(fr, SOUND({ rms: 0.04 + (i % 4) * 0.02, centroid: 1500 + (i % 5) * 500, attack: 0.2 + (i % 3) * 0.2, onsets: 2 + (i % 5), sustain: 0.4, envelope: env(0.7, 1, 0.6, 0.8) }), now - (2 + i) * DAY))
  })
  theirs.push(...extraTheirs)
  // 내가 보낸 소리는 모든 친구에게 (오늘의 소리를 여러 명에게 보내기)
  const allFriends = [FRIEND, ...extra]
  const sentShares = mine.flatMap((f) => allFriends.map((fr) => ({ flower_id: f.id, to_user: fr.user, created_at: f.created_at, status: 'accepted' })))
  const senderOf = (f) => allFriends.find((fr) => fr.member === f.sender_id)
  // 오늘 두 사람이 모두 공유했으니 오늘의 우리의 꽃
  const a = mine[2], b = theirs[2]
  const pairs = [{ id: `pair-${FRIEND.user}-${localDate(now)}`, friend: FRIEND.user, flower_a_id: a.id, flower_b_id: b.id, name: pairName(a.root, b.root), sent_date: localDate(now) }]
  // 민지도 오늘 보냈으니 민지와의 우리의 꽃도 따로 핀다
  if (extra[0]) {
    const m = extraTheirs[1]
    pairs.push({ id: `pair-${extra[0].user}-${localDate(now)}`, friend: extra[0].user, flower_a_id: a.id, flower_b_id: m.id, name: pairName(a.root, m.root), sent_date: localDate(now) })
  }
  // 받은 소리함: 아직 심을지 고르지 않은 소리 하나
  const waiting = flower(FRIEND, SOUND({ rms: 0.05, centroid: 3000, attack: 0.7, onsets: 6, sustain: 0.1, envelope: env(1, 0.2, 0.9, 0.3, 1, 0.2) }), now - 10 * 60000)
  const inbox = [{ ...waiting, share_id: 'share-waiting', from_user: FRIEND.user, shared_at: waiting.created_at }]
  if (extra[1]) {
    const w2 = flower(extra[1], VOICE('joy', { rms: 0.06, centroid: 2700, attack: 0.5, onsets: 4, sustain: 0.4, envelope: env(0.8, 1, 0.7, 0.9) }, '하하'), now - 5 * 60000)
    inbox.push({ ...w2, share_id: 'share-waiting-2', from_user: extra[1].user, shared_at: w2.created_at })
  }
  // ?many=N: 받아서 심은 소리를 N송이까지 채운다 (정원 50송이 알림·배치 확인용)
  // ?inbox=N: 날짜·최신순·소리함 내부 스크롤 확인용.
  const inboxCount = Math.min(40, Number(new URLSearchParams(location.search).get('inbox')) || 0)
  for (let i = inbox.length; i < inboxCount; i++) {
    const who = allFriends[i % allFriends.length]
    const sample = flower(who, SOUND({ rms: 0.04, centroid: 2200, attack: 0.4, onsets: 3, sustain: 0.3, envelope: env(0.8, 0.4, 0.7) }), now - (i - 1) * DAY)
    inbox.push({ ...sample, share_id: `share-inbox-${i}`, from_user: who.user, shared_at: sample.created_at })
  }
  const many = Math.min(50, Math.max(0, Number(new URLSearchParams(location.search).get('many')) || 0))
  const pool = [FRIEND, ...extra]
  const cats = ['joy', 'excited', 'flutter', 'cozy', 'calm', 'sad', 'tense']
  for (let i = theirs.length; i < many; i++) {
    const who = pool[i % pool.length]
    const f = { rms: 0.02 + (i % 7) * 0.018, centroid: 900 + (i * 373) % 3200, attack: (i % 5) * 0.17, onsets: 1 + (i % 6), sustain: (i % 4) * 0.25, envelope: env(0.6, 1, 0.5 + (i % 3) * 0.2, 0.8) }
    const fl = flower(who, i % 3 ? SOUND(f) : VOICE(cats[i % cats.length], f, null), now - (i + 3) * 3600000)
    theirs.push(fl)
  }
  const declined = flower(FRIEND, SOUND({ rms: 0.04, centroid: 2200, attack: 0.4, onsets: 3, sustain: 0.3, envelope: env(0.8, 0.4, 0.7) }), now - DAY)
  // 정원 50개 제한을 지키면서 나머지는 앨범 보관 상태로 채운다.
  const stored = []
  const additional = Math.max(0, albumCount - theirs.length - inbox.length - 1)
  for (let i = 0; i < additional; i++) {
    const who = pool[i % pool.length]
    const features = { rms: 0.02 + (i % 5) * 0.018, centroid: 900 + (i * 373) % 3200, attack: (i % 5) * 0.17, onsets: 1 + i % 6, sustain: (i % 4) * 0.25, envelope: env(0.6, 1, 0.7, 0.8) }
    const item = flower(who, i % 3 ? SOUND(features) : VOICE(cats[i % cats.length], features, '오늘도 수고했어'), now - Math.floor(i / 8) * DAY - (i % 8) * 3600000)
    stored.push({ ...item, share_id: `share-stored-${i}`, share_status: 'archived', from_user: who.user, shared_at: item.created_at })
  }
  const { receivedFlowers, ...received } = receivedSoundCollections([
    ...theirs.map((f, i) => ({ ...f, share_id: `share-accepted-${i}`, share_status: i < 50 ? 'accepted' : 'archived', from_user: senderOf(f).user, shared_at: f.created_at })),
    ...stored,
    ...inbox.map((f) => ({ ...f, share_status: 'pending' })),
    { ...declined, share_id: 'share-declined', share_status: 'declined', from_user: FRIEND.user, shared_at: declined.created_at },
  ])
  return { ...base, flowers: [...mine, ...receivedFlowers], sentShares, ...received, archived: [], pairs }
}

export default function HomeDemo() {
  const q = new URLSearchParams(location.search)
  const withFlowers = q.get('flowers') !== '0'
  const friendCount = Math.min(200, Math.max(1, Math.floor(Number(q.get('friends')) || 1)))
  const albumCount = Math.min(5000, Math.max(0, Math.floor(Number(q.get('album')) || 0)))
  const data = makeData(withFlowers, friendCount, albumCount)
  return (
    <Garden
      key={`${withFlowers ? 'with' : 'empty'}-${friendCount}-${albumCount}`}
      initialTab={q.get('tab')}
      session={{ gardenId: 'g-me', memberId: ME.member, code: '123456' }}
      email="demo@sup.app"
      onSignOut={() => {}}
      demo={data}
    />
  )
}
