import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// `npm run dev:phone` → 같은 와이파이의 휴대폰에서 https로 접속 (마이크 권한은 https 필요)
// GitHub Pages는 저장소 이름 아래(/kuccton/)에서 서비스되므로 빌드할 때만 VITE_BASE로 바꾼다. Vercel·앱은 기본 '/'
export default defineConfig(({ mode }) => ({
  base: process.env.VITE_BASE || '/',
  plugins: [react(), ...(mode === 'phone' ? [basicSsl()] : [])],
}))
