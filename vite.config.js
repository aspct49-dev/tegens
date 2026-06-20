import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const KEY = env.RAINBET_API_KEY || ''

  return {
    plugins: [react()],
    server: {
      port: 5173,
      open: true,
      // Dev-only proxy: the browser calls same-origin /api/affiliates,
      // and Vite forwards it to Rainbet with the secret key appended.
      proxy: {
        '/api/affiliates': {
          target: 'https://services.rainbet.com',
          changeOrigin: true,
          secure: true,
          rewrite: (path) => {
            const qs = path.includes('?') ? path.slice(path.indexOf('?') + 1) : ''
            const sep = qs ? '&' : ''
            return `/v1/external/affiliates?${qs}${sep}key=${KEY}`
          },
        },
      },
    },
  }
})
