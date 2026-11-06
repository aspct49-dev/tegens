// Makes a secret seed for the monthly raffle and the hash to publish first.
//
//   node scripts/raffle-seed.mjs
//
// 1. BEFORE the raffle month ends, put the printed hash in config.raffle.seedHash
//    and deploy. That commits to the draws without revealing them.
// 2. Keep the seed private (a password manager is fine).
// 3. AFTER the month has ended, put the seed in config.raffle.seed and deploy.
//    Every visitor's browser then runs the same draws, and the page checks the
//    seed against the hash published earlier ("Verify every draw").
import { createHash, randomBytes } from 'node:crypto'

const seed = randomBytes(32).toString('hex')
const hash = createHash('sha256').update(seed).digest('hex')
console.log(`seed (keep secret until the month ends): ${seed}`)
console.log(`seedHash (publish now):                  ${hash}`)
