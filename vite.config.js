import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages 部署在 /travel-album/ 子路径下
export default defineConfig({
  plugins: [react()],
  base: '/travel-album/',
})
