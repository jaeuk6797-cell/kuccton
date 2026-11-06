// 개발용: 실제 홈(Garden) 화면을 가짜 데이터로 보기. Supabase 계정·녹음 없이 화면만 확인한다.
//   npm run dev → /?view=home            꽃이 있는 정원 (친구 1명, 오늘 우리의 꽃까지)
//                 /?view=home&flowers=0  꽃이 하나도 없는 정원
// 꽃 데이터는 실제 앱과 같은 규칙(flower.js → naming.js toFlowerRow)으로 만든다.
import Garden from '../components/Garden.jsx'
import { buildFlower, buildSoundFlower } from '../lib/flower.js'
import { toFlowerRow, pairName } from '../lib/naming.js'

const DAY = 86400000
const localDate = (t) => new Date(t).toLocaleDateString('sv-SE')
const iso = (t) => new Date(t).toISOString()

const ME = { member: 'me', user: 'u-me', name: '여정' }
const FRIEND = { member: 'm-jae', user: 'u-jae', name: '재욱' }

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

function makeData(withFlowers) {
  const now = Date.now()
  const friends = [{ member_id: FRIEND.member, user_id: FRIEND.user, nickname: FRIEND.name, since: iso(now - 3 * DAY), is_public: true }]
  const members = [
    { id: ME.member, user_id: ME.user, garden_id: 'g-me', nickname: ME.name, created_at: iso(now - 3 * DAY) },
    { id: FRIEND.member, user_id: FRIEND.user, nickname: FRIEND.name, created_at: iso(now - 3 * DAY), friend: true },
  ]
  const base = { garden: { id: 'g-me', code: '123456', created_at: iso(now - 3 * DAY), is_public: false }, members, friends, userId: ME.user }
  if (!withFlowers) return { ...base, flowers: [], sentShares: [], receivedShares: [], inbox: [], pairs: [] }

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
  const sentShares = mine.map((f) => ({ flower_id: f.id, to_user: FRIEND.user, created_at: f.created_at }))
  const receivedShares = theirs.map((f) => ({ flower_id: f.id, from_user: FRIEND.user, created_at: f.created_at }))
  // 오늘 두 사람이 모두 공유했으니 오늘의 우리의 꽃
  const a = mine[2], b = theirs[2]
  const pairs = [{ id: `pair-${FRIEND.user}-${localDate(now)}`, friend: FRIEND.user, flower_a_id: a.id, flower_b_id: b.id, name: pairName(a.root, b.root), sent_date: localDate(now) }]
  // 받은 소리함: 아직 심을지 고르지 않은 소리 하나
  const waiting = flower(FRIEND, SOUND({ rms: 0.05, centroid: 3000, attack: 0.7, onsets: 6, sustain: 0.1, envelope: env(1, 0.2, 0.9, 0.3, 1, 0.2) }), now - 10 * 60000)
  const inbox = [{ ...waiting, share_id: 'share-waiting', from_user: FRIEND.user, shared_at: waiting.created_at }]
  return { ...base, flowers: [...mine, ...theirs], sentShares, receivedShares, inbox, pairs }
}

export default function HomeDemo() {
  const withFlowers = new URLSearchParams(location.search).get('flowers') !== '0'
  const data = makeData(withFlowers)
  return (
    <Garden
      key={withFlowers ? 'with' : 'empty'}
      session={{ gardenId: 'g-me', memberId: ME.member, code: '123456' }}
      email="demo@sup.app"
      onSignOut={() => {}}
      demo={data}
    />
  )
}
