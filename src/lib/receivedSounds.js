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
