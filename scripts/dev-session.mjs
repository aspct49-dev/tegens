// Dev/testing only: print a session cookie for a fake signed-in account, so admin
// routes can be called with curl without a real Kick sign-in. Never use in production.
//   node scripts/dev-session.mjs [kickUsername] [--discord <id>]
//   curl -H "Cookie: $(node scripts/dev-session.mjs aspect900)" http://localhost:5191/api/admin/status
process.loadEnvFile('.env')
const { seal } = await import('../server/http.js')
const { envValue } = await import('../server/env.js')
const name = process.argv[2] ?? 'aspect900'
const user = {
  id: `kick-dev-${name}`,
  kick: { id: `dev-${name}`, username: name, avatar: null },
  discord: null,
  signedInAt: Math.floor(Date.now() / 1000),
  via: 'kick',
}
process.stdout.write(`tg_session=${encodeURIComponent(seal(user, envValue('SESSION_SECRET')))}`)
