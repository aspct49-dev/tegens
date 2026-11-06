// Calls to /api/admin/* (and the public feature routes) from the admin pages.
// Every call throws an Error with the server's message when it fails.

async function request(path, init) {
  const res = await fetch(path, { credentials: 'same-origin', ...init })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  // something changed: the side nav re-reads its "waiting" badges (AdminPage)
  if (init?.method && init.method !== 'GET') window.dispatchEvent(new Event('adm:changed'))
  return data
}

export const apiGet = (path) => request(path)

export const apiPost = (path, body = {}) =>
  request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
