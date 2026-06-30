import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: '/admin/',
  server: {
    port: 5173,
    proxy: {
      '/admin/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../dist/admin',
    emptyOutDir: true,
  },
})