// 꽃말(STT)
// - 브라우저: Web Speech API를 녹음과 동시에 실행
// - 앱(Capacitor): 녹음 중에는 마이크를 녹음기가 쓰고 있어서, 미리보기 화면에서 '말로 적기'로 따로 받아 적는다
import { Capacitor } from '@capacitor/core'
import { SpeechRecognition } from '@capacitor-community/speech-recognition'

export const isNative = Capacitor.isNativePlatform()

const WebSR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)

/** 녹음과 동시에 받아쓰기 시작. 반환 { stop(): string } — 지원하지 않으면 null */
export function startLiveTranscript() {
  if (isNative || !WebSR) return null
  let text = ''
  const sr = new WebSR()
  sr.lang = 'ko-KR'
  sr.continuous = true
  sr.interimResults = true
  sr.onresult = (e) => {
    let t = ''
    for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript
    text = t.trim()
  }
  sr.onerror = () => {}
  try { sr.start() } catch { return null }
  return {
    get text() { return text },
    stop() { try { sr.stop() } catch {} },
  }
}

export const canDictate = isNative

/** 앱에서 한 문장 받아쓰기 */
export async function dictateOnce() {
  const { available } = await SpeechRecognition.available()
  if (!available) throw new Error('이 기기에서는 음성 인식을 쓸 수 없어요.')
  const perm = await SpeechRecognition.requestPermissions()
  if (perm.speechRecognition !== 'granted') throw new Error('음성 인식 권한이 필요해요.')
  const r = await SpeechRecognition.start({ language: 'ko-KR', maxResults: 1, partialResults: false, popup: false })
  return r.matches?.[0] || ''
}
