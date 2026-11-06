// 전체 수신 내역은 보관하고, 소리함과 정원에는 해당 상태만 노출한다.
export function newestReceivedFirst(items) {
  const sentAt = (item) => Date.parse(item.shared_at || item.created_at) || 0
  return [...items].sort((a, b) => sentAt(b) - sentAt(a))
}

export function receivedSoundCollections(receivedHistory) {
  const accepted = receivedHistory.filter((f) => f.share_status === 'accepted')
  return {
    receivedHistory,
    inbox: receivedHistory.filter((f) => f.share_status === 'pending'),
    receivedFlowers: accepted.map((f) => ({ ...f, planted_share_id: f.share_id })),
    archived: receivedHistory.filter((f) => f.share_status === 'archived').map((f) => ({ ...f, archived: true })),
    receivedShares: accepted.map((f) => ({
      id: f.share_id, flower_id: f.id, from_user: f.from_user,
      created_at: f.shared_at, status: f.share_status,
    })),
  }
}

// 친구 삭제 시 선택한 소리를 이 기기의 화면에서만 숨긴다. 원본 데이터는 수정하지 않는다.
export function hideReceivedSounds(data, hidden) {
  if (!data || (!hidden.shares.length && !hidden.pairs.length)) return data
  const shareIds = new Set(hidden.shares)
  const pairIds = new Set(hidden.pairs)
  const flowerIds = new Set(data.receivedHistory.filter((flower) => shareIds.has(flower.share_id)).map((flower) => flower.id))
  return {
    ...data,
    receivedHistory: data.receivedHistory.filter((flower) => !shareIds.has(flower.share_id)),
    receivedShares: data.receivedShares.filter((share) => !shareIds.has(share.id)),
    inbox: data.inbox.filter((flower) => !shareIds.has(flower.share_id)),
    archived: (data.archived || []).filter((flower) => !shareIds.has(flower.share_id)),
    flowers: data.flowers.filter((flower) => !flowerIds.has(flower.id)),
    pairs: data.pairs.filter((pair) => !pairIds.has(pair.id) && !flowerIds.has(pair.flower_a_id) && !flowerIds.has(pair.flower_b_id)),
  }
}
