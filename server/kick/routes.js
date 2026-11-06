// Kick chat webhook + bot routes (see server/api.js for the handle(req, ctx) contract).
// Importing chat.js registers the 24/7 chat socket with server/background.js.
//
//   POST /api/kick/webhook               Kick → site (signed; public)
//   GET  /api/admin/kick/status          chat + bot status (the admin card)
//   POST /api/admin/kick/reconnect       drop the chat socket and connect again
//   GET  /api/admin/kick/bot/connect     Kick sign-in as the bot account
//   GET  /api/kick/bot/callback          … back here, then /admin?tab=overview
//   POST /api/admin/kick/bot/disconnect
//   POST /api/admin/kick/bot/test        post a test message as the bot

import { json } from '../http.js'
import { botStatus, disconnectBot, finishBotConnect, sendChat, startBotConnect } from './bot.js'
import { chatStatus, ensureChat, handleWebhook, restartChat } from './chat.js'

const status = async (chat) => json(200, { ...(chat ?? (await chatStatus())), bot: await botStatus() })
const postOnly = (ctx) => (ctx.method === 'POST' ? null : json(405, { error: 'Use POST.' }))

export async function handle(req, ctx) {
  const p = ctx.path
  if (!p.startsWith('/api/kick/') && !p.startsWith('/api/admin/kick/')) return null
  // the dev server started its jobs before this module existed (or reloaded it): start the socket
  ensureChat()

  if (p === '/api/kick/webhook') return handleWebhook(req)
  if (p === '/api/kick/bot/callback') return finishBotConnect(req, ctx)

  // /api/admin/* only reaches here for admins (server/api.js)
  if (p === '/api/admin/kick/status') return status()
  if (p === '/api/admin/kick/reconnect') return postOnly(ctx) ?? status(await restartChat())
  if (p === '/api/admin/kick/bot/connect') return startBotConnect(req)
  if (p === '/api/admin/kick/bot/disconnect') {
    if (postOnly(ctx)) return postOnly(ctx)
    await disconnectBot()
    return status()
  }
  if (p === '/api/admin/kick/bot/test') {
    if (postOnly(ctx)) return postOnly(ctx)
    const text = typeof ctx.body.text === 'string' && ctx.body.text.trim() ? ctx.body.text : 'TEGENS bot check: connected ✅'
    const ok = await sendChat(text)
    if (!ok) return json(502, { error: (await botStatus()).error ?? 'The bot couldn’t post. Is it connected?' })
    return status()
  }
  return json(404, { error: 'Not found.' })
}
