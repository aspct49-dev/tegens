# TEGENS 2.0 — Rainbet Leaderboard

React + Vite build of the TEGENS Figma designs, wired to the live Rainbet
affiliate API. Six pages: Home (`/`), Leaderboard (`/leaderboard`), Milestones
(`/milestones`), Item Store (`/store`), Refer to Earn (`/refer`) and How to Sign Up
(`/how-to-sign-up`).

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

On the VPS, `server/index.js` serves everything (pages, files and `/api`), and nginx
only adds HTTPS and proxies **every** path to it. Don't serve `dist/` from nginx with
`try_files … /index.html`: that would skip the per-page tags, `robots.txt`,
`sitemap.xml`, the 404 status and the redirects below.
```nginx
location / {
  proxy_pass http://127.0.0.1:3001;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

## Search, analytics and contact
- **Per-page tags** (`server/seo.js`, page text in `src/seo.js`): title, description,
  canonical, Open Graph / Twitter tags, Organization + BreadcrumbList JSON-LD, and a plain
  HTML version of each page's heading and links for crawlers that don't run JavaScript.
- **`/robots.txt` and `/sitemap.xml`** are generated from the same list. Unknown paths
  answer 404 with the "Page not found" page; `/admin`, `/profile` and `/overlay/*` send
  `noindex`. Redirects (301): `/index.html` → `/`, trailing slashes, and a known page
  typed in the wrong case.
- **.env**: `SITE_URL` (default https://tegens.bet), `GOOGLE_SITE_VERIFICATION`,
  `GA_MEASUREMENT_ID` (analytics loads only after the visitor allows it in the cookie
  banner; in GA4 turn off Enhanced measurement → "Page changes based on browser history
  events", the site sends its own page views), `DISCORD_ADMIN_WEBHOOK` (admin alerts and
  the `/contact` form).
- **Images**: `node scripts/optimize-images.mjs` makes WebP copies of large images in
  `public/assets`; point the code at the `.webp`.

Standings re-poll every 60s. Players are ranked by `wagered_amount`, capped to the
prize slots, and usernames are masked (`Tegens***`).

## Editing content — `src/config.js`
- `prizePool`, `prizes` (per rank, 1st → 10th)
- `leaderboard.startAt/endAt` — leave `null` to auto-use the current UTC month
- `referralCode`, `casinoUrl`, `homeUrl`
- `pastLeaderboards` — the Past Leaderboards section stays hidden while this is empty.
  Give each entry `startAt`/`endAt` and "View Winners" loads that period's final top 10.
- `discordUrl` — where claims, store redemptions and referrals are sent (by ticket)
- `milestones.tiers` — name, wager threshold, prize, colour and icon per rank;
  `milestones.trackSince` — lifetime wager is summed from this date
- `storeItems` — name, cost (TEGEN points), stock (0 = sold out), image and art style
- `referral` — the high-roller reward and qualifying wager on Refer to Earn

## Rank tracking
Visitors enter their Rainbet username on the side-nav rank card. The site sums
their wager under the code since `milestones.trackSince` (the API only accepts
~4-month ranges, so it reads 120-day windows), remembers the username in the
browser, and shows tier progress there and on the Milestones page. Claims and
store purchases open a Discord ticket; there is no points backend.
