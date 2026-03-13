import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    open: true, // 이 줄을 추가하면 실행 시 창이 자동으로 뜹니다!
  },
})
