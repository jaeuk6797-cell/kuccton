// 사람 목소리 카테고리를 골랐을 때만 호출한다 (HyunaZ/hubert_emotion 서버, server/ 폴더).
const API_URL = import.meta.env.VITE_EMOTION_API_URL

export const emotionEnabled = Boolean(API_URL)

export async function analyzeEmotion(blob) {
  const form = new FormData()
  form.append('file', blob, 'voice.webm')
  const res = await fetch(`${API_URL}/emotion`, {
    method: 'POST',
    headers: { 'ngrok-skip-browser-warning': '1' },
    body: form,
  })
  if (!res.ok) throw new Error(`감정 분석 실패 (${res.status})`)
  return res.json() // { emotion, intensity, scores }
}
