import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

// 개발 서버에서만: ?view=island → Supabase 없이 3D 정원 확인 (배포 빌드에는 포함되지 않음)
const devView = import.meta.env.DEV && new URLSearchParams(location.search).get('view')
const Root = devView === 'island'
  ? React.lazy(() => import('./dev/IslandPreview.jsx'))
  : App

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <React.Suspense fallback={null}>
      <Root />
    </React.Suspense>
  </React.StrictMode>,
)
