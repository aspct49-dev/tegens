# TEGENS 2.0 — Rainbet Leaderboard

Single-page React + Vite build of the "Wruless" Figma leaderboard design, wired to
the live Rainbet affiliate API.

## Getting started
```bash
npm install
cp .env.example .env      # put your real RAINBET_API_KEY in .env
npm run dev               # http://localhost:5173
```

## How the data flows
The browser only calls same-origin `/api/affiliates?start_at=…&end_at=…`; the key is
added server-side and never shipped to the client:
- **Dev:** Vite proxy in `vite.config.js`
- **Vercel:** serverless function `api/affiliates.js` (set `RAINBET_API_KEY` in project env)
- **VPS:** `vps-server.mjs` behind Nginx

Standings re-poll every 60s. Players are ranked by `wagered_amount`, capped to the
prize slots, and usernames are masked (`Tegens***`).

## Editing content — `src/config.js`
- `prizePool`, `prizes` (per rank, 1st → 10th)
- `leaderboard.startAt/endAt` — leave `null` to auto-use the current UTC month
- `referralCode`, `casinoUrl`, `homeUrl`
- `pastLeaderboards` — the Past Leaderboards section stays hidden while this is empty
