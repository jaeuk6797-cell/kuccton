import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { hideReceivedSounds } from '../src/lib/receivedSounds.js'
import { pairName } from '../src/lib/naming.js'

// DB 모듈 전체를 읽고 Supabase 통신만 바꿔 삭제 범위를 검증한다.
const source = (await readFile(new URL('../src/lib/db.js', import.meta.url), 'utf8'))
  .replace(/^import .*\n/gm, '')
  .replace(/import\.meta\.env\.VITE_\w+/g, "'test'")
  .replace(/^export /gm, '')
function dbHarness(user = { id: '00000000-0000-0000-0000-000000000002' }, result = { error: null }) {
  const calls = []
  const query = {
    delete() { calls.push(['delete']); return this },
    eq(column, value) { calls.push(['eq', column, value]); return this },
    then(resolve) { return Promise.resolve(result).then(resolve) },
  }
  const context = vm.createContext({ pairName, createClient: () => ({
    auth: { getSession: async () => ({ data: { session: user && { user } } }) },
    from(table) { calls.push(['from', table]); return query },
  }) })
  vm.runInContext(source, context)
  return { api: context, calls }
}

test('친구 삭제는 로그인한 계정과 선택한 친구의 관계만 지우고 소리 테이블은 건드리지 않는다', async () => {
  const { api, calls } = dbHarness()
  await api.removeFriend('00000000-0000-0000-0000-000000000001')
  assert.deepEqual(calls, [['from', 'friendships'], ['delete'], ['eq', 'user_a', '00000000-0000-0000-0000-000000000001'], ['eq', 'user_b', '00000000-0000-0000-0000-000000000002']])
  const loggedOut = dbHarness(null)
  await assert.rejects(loggedOut.api.removeFriend('friend'), /로그인/)
  assert.equal(loggedOut.calls.length, 0)
  const failed = dbHarness(undefined, { error: { message: '서버 오류' } })
  await assert.rejects(failed.api.removeFriend('friend'), /서버 오류/)
})

test('관계를 해제해도 공유 기록으로 우리의 꽃을 유지한다', () => {
  const { api } = dbHarness()
  const sent = [{ flower_id: 'mine', to_user: 'friend', created_at: '2026-11-06T12:00:00Z' }]
  const received = [{ flower_id: 'theirs', from_user: 'friend', created_at: '2026-11-06T12:00:01Z' }]
  const flowers = { mine: { id: 'mine', root: '도란' }, theirs: { id: 'theirs', root: '새근' } }
  assert.equal(api.derivePairs([], sent, received, flowers).length, 1)
  assert.equal(api.derivePairs([], sent, [], flowers).length, 0)
})

test('화면 숨김은 선택한 수신 소리와 우리의 꽃만 가리고 원본·다른 친구·보낸 기록은 유지한다', () => {
  const received = { id: 'theirs', share_id: 'share-a' }
  const other = { id: 'other', share_id: 'share-b' }
  const mine = { id: 'mine' }
  const data = { flowers: [mine, received, other], receivedHistory: [received, other], receivedShares: [{ id: 'share-a' }, { id: 'share-b' }], inbox: [received], archived: [received], sentShares: [{ id: 'sent' }], pairs: [{ id: 'pair-a', flower_a_id: 'mine', flower_b_id: 'theirs' }, { id: 'pair-b', flower_a_id: 'mine', flower_b_id: 'other' }] }
  const before = structuredClone(data)
  assert.equal(hideReceivedSounds(data, { shares: [], pairs: [] }), data)
  const visible = hideReceivedSounds(data, { shares: ['share-a'], pairs: ['pair-a'] })
  assert.deepEqual(visible.flowers.map(f => f.id), ['mine', 'other'])
  assert.deepEqual(visible.receivedHistory, [other])
  assert.deepEqual(visible.receivedShares, [{ id: 'share-b' }])
  assert.deepEqual(visible.inbox, [])
  assert.deepEqual(visible.pairs.map(p => p.id), ['pair-b'])
  assert.equal(visible.sentShares, data.sentShares)
  assert.deepEqual(data, before)
})
