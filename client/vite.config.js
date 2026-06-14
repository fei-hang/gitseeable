import { defineConfig, createLogger } from 'vite'
import react from '@vitejs/plugin-react'

const logger = createLogger()

export default defineConfig({
  plugins: [react()],
  customLogger: {
    ...logger,
    error(msg) {
      if (typeof msg === 'string' && msg.includes('http proxy error')) return
      logger.error(msg)
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      }
    }
  }
})
