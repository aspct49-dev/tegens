// Server settings from the environment (.env on the VPS and in dev).
// Names are matched without regard to case, so `kick_client_id` and
// `KICK_CLIENT_ID` both work.

export function envValue(name) {
  if (process.env[name] !== undefined) return process.env[name]
  const want = name.toLowerCase()
  for (const [k, v] of Object.entries(process.env)) if (k.toLowerCase() === want) return v
  return ''
}
