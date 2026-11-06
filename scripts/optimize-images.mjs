// Make WebP copies of the large PNG/JPG images in public/assets (the originals stay).
//
//   node scripts/optimize-images.mjs            convert files over 60 KB without an up-to-date .webp
//   node scripts/optimize-images.mjs --all      redo every one
//
// The site then points at the .webp (every current browser supports it). Re-run after
// replacing an image, and update its references if you add a new large one.

import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets')
const MIN = 60 * 1024
const all = process.argv.includes('--all')

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) yield* walk(p)
    else if (/\.(png|jpe?g)$/i.test(e.name)) yield p
  }
}

let before = 0
let after = 0
for await (const file of walk(ROOT)) {
  const info = await stat(file)
  if (info.size < MIN) continue
  const out = file.replace(/\.(png|jpe?g)$/i, '.webp')
  const done = await stat(out).catch(() => null)
  if (done && !all && done.mtimeMs >= info.mtimeMs) continue
  await sharp(file).webp({ quality: 92, alphaQuality: 95, smartSubsample: true, effort: 6 }).toFile(out)
  const size = (await stat(out)).size
  before += info.size
  after += size
  console.log(`${path.relative(ROOT, file).padEnd(40)} ${(info.size / 1024).toFixed(0).padStart(5)} KB → ${(size / 1024).toFixed(0).padStart(5)} KB`)
}
if (before) console.log(`\nTotal ${(before / 1024).toFixed(0)} KB → ${(after / 1024).toFixed(0)} KB`)
else console.log('Nothing to convert.')
