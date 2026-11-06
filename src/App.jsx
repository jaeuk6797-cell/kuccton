// 임시 라우팅: 실제 화면(Scene, Island)이 생기면 교체한다.
//   /                 → 3D 꽃 플레이그라운드
//   /?view=analyze    → 녹음·분석 파이프라인 테스트
import React from 'react'
import FlowerPlayground from './dev/FlowerPlayground.jsx'
import AnalyzeTest from './dev/AnalyzeTest.jsx'

export default function App() {
  const view = new URLSearchParams(window.location.search).get('view')
  return view === 'analyze' ? <AnalyzeTest /> : <FlowerPlayground />
}
