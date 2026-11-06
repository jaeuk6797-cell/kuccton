import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

// 개발 서버에서만: ?view=island → Supabase 없이 3D 정원 확인 (배포 빌드에는 포함되지 않음)
const devView = import.meta.env.DEV && new URLSearchParams(location.search).get('view')
// 개발 서버에서만: ?view=island(가짜 꽃 정원) · ?view=flowers(감정 꽃 7종)
const DEV_VIEWS = {
  island: () => import('./dev/IslandPreview.jsx'),
  flowers: () => import('./dev/EmotionFlowers.jsx'),
}
const Root = DEV_VIEWS[devView] ? React.lazy(DEV_VIEWS[devView]) : App

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <React.Suspense fallback={null}>
      <Root />
    </React.Suspense>
  </React.StrictMode>,
)
