// The site's data: one JSON file per table under DATA_DIR (default data/store).
// Writes go to a temp file and are renamed into place, so a crash never leaves a
// half-written table, and updates to one table run one at a time.
//
//   read('players')                  → the table's value (a copy-safe parse)
//   update('players', (list) => …)    → write the function's result, return it
//
// A table not listed in DEFAULTS can pass its own starting value:
//   read('hunts', [])  /  update('hunts', fn, [])

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { envValue } from './env.js'

/** Each table's value when it doesn't exist yet */
const DEFAULTS = {
  players: [],
  hunts: [],
  guesses: [],
  tournaments: [],
  giveaway: null,
  giveawayWins: [],
  challenges: [],
  raffles: [],
  raffleSnapshots: {},
  chatters: {},
  kickChat: {},
  bot: {},
}

const dir = () => path.resolve(envValue('DATA_DIR') || path.join(process.cwd(), 'data', 'store'))
const file = (table) => path.join(dir(), `${table}.json`)
const cache = new Map()
const queues = new Map()

const fresh = (table, fallback) => structuredClone(table in DEFAULTS ? DEFAULTS[table] : (fallback ?? null))

export async function read(table, fallback) {
  if (cache.has(table)) return structuredClone(cache.get(table))
  let value
  try {
    value = JSON.parse(await readFile(file(table), 'utf8'))
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
    value = fresh(table, fallback)
  }
  cache.set(table, value)
  return structuredClone(value)
}

async function write(table, value) {
  await mkdir(dir(), { recursive: true })
  const tmp = `${file(table)}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tmp, JSON.stringify(value))
  await rename(tmp, file(table))
  cache.set(table, value)
}

/** Read, change and write one table; calls on the same table never overlap */
export function update(table, fn, fallback) {
  const run = async () => {
    const next = await fn(await read(table, fallback))
    await write(table, next)
    return structuredClone(next)
  }
  const queued = (queues.get(table) ?? Promise.resolve()).then(run, run)
  queues.set(table, queued.catch(() => {}))
  return queued
}

export const storeDir = dir
