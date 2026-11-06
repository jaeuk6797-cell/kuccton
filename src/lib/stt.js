// 꽃말(STT)
// - 브라우저: Web Speech API를 녹음과 동시에 실행
// - 앱(Capacitor): 녹음 중에는 마이크를 녹음기가 쓰고 있어서, 미리보기 화면에서 '말로 적기'로 따로 받아 적는다
import { Capacitor } from '@capacitor/core'
import { SpeechRecognition } from '@capacitor-community/speech-recognition'

export const isNative = Capacitor.isNativePlatform()

const WebSR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)

/** 녹음과 동시에 받아쓰기 시작. 반환 { text, finish(): Promise<string> } — 지원하지 않으면 null
 *  크롬은 잠깐 조용하면 인식을 스스로 끝내므로, 멈추기 전까지 자동으로 다시 시작해 결과를 이어 붙인다 */
export function startLiveTranscript() {
  if (isNative || !WebSR) return null
  let done = '' // 확정된 문장들
  let live = '' // 지금 인식 중인 문장
  let active = true
  let ended
  const endedP = new Promise((r) => { ended = r })
  const sr = new WebSR()
  sr.lang = 'ko-KR'
  sr.continuous = true
  sr.interimResults = true
  sr.maxAlternatives = 1
  sr.onresult = (e) => {
    let fin = '', tmp = ''
    for (let i = 0; i < e.results.length; i++) {
      const r = e.results[i]
      if (r.isFinal) fin += r[0].transcript + ' '
      else tmp += r[0].transcript
    }
    live = (fin + tmp).trim()
  }
  sr.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') active = false
  }
  sr.onend = () => {
    done = (done + ' ' + live).trim()
    live = ''
    if (active) { try { sr.start(); return } catch {} }
    ended()
  }
  try { sr.start() } catch { return null }
  return {
    get text() { return (done + ' ' + live).trim() },
    /** 멈추고, 마지막 결과가 들어올 때까지(최대 2.5초) 기다린 뒤 전체 글자를 돌려준다 */
    async finish() {
      active = false
      try { sr.stop() } catch { ended() }
      await Promise.race([endedP, new Promise((r) => setTimeout(r, 2500))])
      return (done + ' ' + live).trim()
    },
    stop() { active = false; try { sr.abort() } catch {} },
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
