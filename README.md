# TEGENS — Rainbet Leaderboard

A React + Vite affiliate site for the **TEGENS** Rainbet code: a home page (hero,
mascot + floating coins, bonus cards) and a **live leaderboard** powered by the
Rainbet affiliate API.

## Tech
- **React 18 + Vite** SPA, **React Router** (`/` home, `/leaderboard`).
- Live standings from the Rainbet affiliate API, fetched through a **key-safe
  proxy** so the API key never reaches the browser:
  - **Dev:** Vite dev-server proxy (`vite.config.js`).
  - **Prod:** serverless function at [`api/affiliates.js`](api/affiliates.js).

## Getting started
```bash
npm install
cp .env.example .env      # then put your real RAINBET_API_KEY in .env
npm run dev               # http://localhost:5173
```
- `npm run build` → production build in `dist/`
- `npm run preview` → preview the build locally

## Environment
| Variable           | Where            | Notes                                             |
| ------------------ | ---------------- | ------------------------------------------------- |
| `RAINBET_API_KEY`  | `.env` (local)   | Used by the Vite dev proxy. Never prefix `VITE_`. |
| `RAINBET_API_KEY`  | Host dashboard   | Used by the serverless function in production.    |

`.env` is gitignored — the key is **not** in this repo.

## Editing content
Almost everything is in [`src/data/leaderboard.js`](src/data/leaderboard.js):
- `config.leaderboard.{startAt,endAt}` — the period queried + countdown target.
- `config.prizes` — prize per rank (also caps how many ranks display).
- `config.referralCode`, `casino`, `socials`, `totalGivenAway`.
- `config.rankAvatars` — podium profile pictures (1st/2nd/3rd).
- `bonuses` — the three home-page bonus cards.

## Deploy (Vercel)
1. Import the repo into Vercel (framework preset: **Vite**).
2. Add an env var **`RAINBET_API_KEY`** with your key.
3. Deploy. `vercel.json` rewrites client routes to `index.html` while leaving
   `/api/*` to the serverless function.

> Other hosts: serve `dist/` as a static SPA (rewrite all non-`/api` routes to
> `index.html`) and provide an equivalent `/api/affiliates` proxy that injects
> the key server-side.
