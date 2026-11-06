// Work that runs all the time in the server process (the Kick chat socket, the
// watch-time counter, ...). Modules register a start function; server/index.js
// (VPS) and vite.config.js (dev) call startBackground() once.
//
//   registerBackground('kick-chat', () => { …start…; return () => { …stop… } })

const state = (globalThis.__tgnBackground ??= { jobs: new Map(), running: new Map() })

export function registerBackground(name, start) {
  state.jobs.set(name, start)
}

export async function startBackground() {
  for (const [name, start] of state.jobs) {
    if (state.running.has(name)) continue
    try {
      state.running.set(name, (await start()) ?? null)
      console.log(`[background] ${name} started`)
    } catch (err) {
      console.error(`[background] ${name} failed to start:`, err)
    }
  }
}

/** Dev only: stop everything (before the modules reload) */
export function stopBackground() {
  for (const [name, stop] of state.running) {
    try {
      stop?.()
    } catch (err) {
      console.error(`[background] ${name} failed to stop:`, err)
    }
  }
  state.running.clear()
}
