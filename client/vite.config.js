import { defineConfig, createLogger } from 'vite'
import react from '@vitejs/plugin-react'

const logger = createLogger()
const startedAt = Date.now()
const STARTUP_WINDOW = 10_000 // ms — suppress proxy errors while server may be starting

export default defineConfig({
  plugins: [react()],
  // 相对资源路径：独立运行挂在根（/assets/...），作为 DSH 插件挂在 /gitseeable/
  // 时同一份构建产物依然有效（/gitseeable/assets/...）。
  base: './',
  customLogger: {
    ...logger,
    error(msg) {
      if (
        typeof msg === 'string' &&
        msg.includes('http proxy error') &&
        Date.now() - startedAt < STARTUP_WINDOW
      ) return
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
