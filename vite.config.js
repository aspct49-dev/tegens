import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// In dev, every /api route (Rainbet proxy, Kick/Discord sign-in, admin) is served
// by the same handlers the VPS uses (server/api.js), with .env loaded into
// process.env so secrets stay server-side.
function siteApi(mode) {
  return {
    name: 'tegens-api',
    configureServer(server) {
      Object.assign(process.env, loadEnv(mode, process.cwd(), ''))
      // the 24/7 jobs (Kick chat socket, watch-time counter) start once the server is up;
      // loading api.js first lets every feature register its job
      server.httpServer?.once('listening', async () => {
        await server.ssrLoadModule('/server/api.js')
        const { startBackground } = await server.ssrLoadModule('/server/background.js')
        startBackground()
      })
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next()
        const { apiMiddleware } = await server.ssrLoadModule('/server/api.js')
        return apiMiddleware(req, res, next)
      })
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), siteApi(mode)],
  server: {
    port: 5173,
    open: true,
    // let a Cloudflare quick tunnel (*.trycloudflare.com) reach the dev server for previews
    allowedHosts: ['.trycloudflare.com'],
  },
}))
