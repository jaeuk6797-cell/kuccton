import { useEffect, useRef, useState } from 'react'
import Flower from './Flower.jsx'
import { Bell, Heart, Mic, Sprout, Users } from './Icons.jsx'

const SAMPLE = { name: '도란도란꽃', category: 'cozy', color: 'hsl(335 65% 78%)', petals: 6, vowel: 'Y', consonant: '평', rms: 0.05 }
const STEPS = [
  { Icon: Users, title: '먼저, 친구를 만나요', body: '메뉴 → 나에서 내 코드를 눌러 복사해 보내세요. 친구의 코드 6자리를 입력하면 친구가 돼요.', caption: '친구를 맺으면 서로의 정원에 소리를 보낼 수 있어요.' },
  { Icon: Mic, title: '오늘의 10초를 담아요', body: '정원의 녹음 버튼을 누르고 주변의 소리나 목소리를 담아 보세요. 받을 친구는 여러 명 고를 수 있어요.', caption: '목소리는 꽃으로, 다른 소리는 나무로 자라요.' },
  { Icon: Bell, title: '친구의 소리를 심어요', body: '메뉴 → 받은 소리함에서 꽃이나 이름을 눌러 들어 보세요. 마음에 드는 소리는 ‘심기’를 눌러요.', caption: '내 정원에는 친구가 보내 준 소리만 자라요.' },
  { Icon: Heart, title: '서로 보내면, 우리의 꽃', body: '같은 날 서로 소리를 보내고 둘 다 심으면 우리의 꽃이 피어요. 이어폰으로 두 사람의 하루를 함께 들어 보세요.', caption: '친구의 소리는 왼쪽, 내 소리는 오른쪽 귀로 들려요.' },
  { Icon: Sprout, title: '언제든 다시 만나요', body: '정원의 꽃을 누르면 그날의 소리가 들려요. 앨범과 친구별 내역에서도 다시 들을 수 있어요.', caption: '‘괜찮아요’ 했던 소리도 친구 내역에서 다시 심을 수 있어요.' },
]

function TutorialArt({ step }) {
  if (step === 0) return <div className="tutorial-friend-art"><span className="tutorial-avatar">나</span><span className="tutorial-code">내 코드<b>123456</b></span><span className="tutorial-avatar partner">친구</span></div>
  if (step === 1) return <div className="tutorial-record-art"><span className="tutorial-mic"><Mic width={32} height={32} /></span><div className="tutorial-wave" aria-hidden="true">{[12, 22, 36, 18, 46, 28, 38, 16, 28].map((h, i) => <i key={i} style={{ height: h }} />)}</div><span>00:10</span></div>
  if (step === 2) return <div className="tutorial-plant-art"><Flower flower={SAMPLE} size={80} stem={false} bloom={false} /><span>↓</span><span className="tutorial-islet"><Sprout width={44} height={44} /></span></div>
  if (step === 3) return <div className="tutorial-pair-art"><span>L</span><Flower flower={SAMPLE} colors={['hsl(335 65% 78%)', 'hsl(220 65% 78%)']} size={108} stem={false} bloom={false} /><span>R</span></div>
  return <div className="tutorial-garden-art"><Flower flower={SAMPLE} size={68} bloom={false} /><Flower flower={{ ...SAMPLE, category: 'sound', root: '타닥', color: 'hsl(130 55% 65%)' }} size={68} bloom={false} /><Flower flower={{ ...SAMPLE, color: 'hsl(220 65% 78%)' }} size={68} bloom={false} /></div>
}

export default function Tutorial({ onDone }) {
  const [step, setStep] = useState(0)
  const panelRef = useRef(null)
  const headingRef = useRef(null)
  const doneRef = useRef(onDone)
  doneRef.current = onDone
  useEffect(() => {
    const previous = document.activeElement
    const keydown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); doneRef.current(false); return }
      if (e.key !== 'Tab') return
      const buttons = [...panelRef.current.querySelectorAll('button:not(:disabled)')]
      const first = buttons[0], last = buttons[buttons.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === headingRef.current)) { e.preventDefault(); last?.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', keydown)
    return () => { document.removeEventListener('keydown', keydown); if (previous?.isConnected) previous.focus() }
  }, [])
  useEffect(() => { headingRef.current?.focus() }, [step])
  const current = STEPS[step]
  return (
    <div className="tutorial-backdrop">
      <section ref={panelRef} className="tutorial-panel" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
        <header className="tutorial-header"><span>SUP 시작하기</span><button onClick={() => onDone(false)}>나중에</button></header>
        <div className="tutorial-progress" aria-label={`${STEPS.length}단계 중 ${step + 1}단계`}>{STEPS.map((_, i) => <span key={i} className={i <= step ? 'done' : ''} />)}</div>
        <div className={`tutorial-art tutorial-art-${step}`} aria-hidden="true"><TutorialArt step={step} /></div>
        <div className="tutorial-copy" key={step}>
          <span className="tutorial-step">0{step + 1} / 0{STEPS.length}</span>
          <h2 id="tutorial-title" tabIndex={-1} ref={headingRef}>{current.title}</h2>
          <p>{current.body}</p><small>{current.caption}</small>
        </div>
        <footer className="tutorial-footer"><button className="tutorial-prev" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>이전</button><button className="primary" onClick={() => step === STEPS.length - 1 ? onDone(true) : setStep((s) => s + 1)}>{step === STEPS.length - 1 ? '내 정원으로' : '다음'}</button></footer>
      </section>
    </div>
  )
}

export function HelpPage({ onTutorial }) {
  return (
    <div className="page help-page">
      <h1 className="page-title">도움말</h1>
      <section className="help-purpose">
        <div className="help-bloom" aria-hidden="true"><Flower flower={SAMPLE} size={110} bloom={false} /></div>
        <div className="help-message">
        <span className="help-brand">SUP</span>
        <h2>말하지 않아도 괜찮아,<br />우리의 하루는 소리로 피어나.</h2>
        <p>하루 10초, 친구에게 나의 하루를 건네요.<br />목소리는 꽃으로, 주변의 소리는 나무로 자라요.</p>
        <small>내 정원은 친구가 보내 준 하루로 채워져요.</small>
        </div>
      </section>
      <button className="tutorial-replay" onClick={onTutorial}>튜토리얼 다시 하기 <span aria-hidden="true">↗</span></button>
    </div>
  )
}
