import { mockFlower } from './contracts/flower.fixture.js'
import GardenScene from './scene/GardenScene.jsx'
import { supabaseStatus } from './services/supabase.js'

const statusLabels = {
  unconfigured: '미설정',
  invalid: '설정 오류',
  configured: '설정됨',
}

export default function App() {
  return (
    <main className="app">
      <GardenScene flowers={[mockFlower]} />
      <header className="app-header">
        <h1>SUP <span>소리숲</span></h1>
        {import.meta.env.DEV && (
          <p className="dev-status">DEV · Supabase {statusLabels[supabaseStatus]}</p>
        )}
      </header>
      <div className="app-controls">
        <button type="button" disabled>녹음 준비 중</button>
      </div>
    </main>
  )
}
