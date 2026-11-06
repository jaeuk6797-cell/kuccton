import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// `npm run dev:phone` → 같은 와이파이의 휴대폰에서 https로 접속 (마이크 권한은 https 필요)
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'phone' ? [basicSsl()] : [])],
}))
