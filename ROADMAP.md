# TEGENS feature checklist

Worked through one at a time, in this order. `[x]` done, `[~]` partly there, `[ ]` to do.

- [x] **Random Slot Picker** — spinning reel of slot art in admin → Slot Picker and /overlay/slots; all slots, chosen providers, or your own list. Public page at /slot-picker (spins in the visitor's browser, shows the stream's latest picks)
- [x] **Tournament Bracket** — admin-controlled bracket (admin → Tournaments, /tournaments, /overlay/tournament)
- [x] **Giveaway Roller** — chat giveaway with !join, draw/re-draw, bot announces and tags the winner (admin → Chat Giveaway, /overlay/giveaway)
- [x] **VIP Panel** — admin → VIPs: add by Kick channel/username, notes, remove
- [x] **VIP Giveaway Roller** — Chat Giveaway "VIP giveaway" toggle (only VIPs can !join) + "Enter every VIP" to draw from the whole list
- [x] **VIP Slot Calls** — VIPs type `!call <slot>` in Kick chat, bot confirms, admin → Slot Calls queue, /overlay/calls shows the current slot (art + name + caller)
- [x] **VIP Win Tracking** — record bet + win on each call (Slot Calls → Now playing)
- [x] **VIP Profiles/Stats** — admin → VIPs → click a VIP: stats, best call, every call played, queue, their activity; public /vips page ranks VIPs by what their calls paid
- [x] **User Accounts** — Kick / Discord sign-in, account stored server-side
- [x] **User Dashboard** — /profile redesigned: member card in the player's tier colour with the 7-tier track, raffle / giveaways / VIP panels, wins (giveaways, guesses, slot calls), connections
- [x] **Giveaway History** — public /giveaways page: live giveaway, totals, and a Past Giveaways strip (RekoJ layout, TEGENS look) with a winners dialog; saved automatically when a giveaway ends, removable in admin
- [ ] **Notifications** — alert users when a giveaway, raffle, tournament or bonus goes live
- [~] **Admin Dashboard** — /admin runs hunts, guesses, tournaments, giveaways, slot picker, raffles, challenges, VIPs, slot calls, activity; only the Item Store / rewards editor is left (store skipped for now)
- [x] **Activity / Audit Log** — admin → Activity: every admin change (who, what, when) logged centrally in server/audit.js, plus VIP !calls from chat; filter by area, search, autosave edits folded
- [x] **Responsible Gambling / 18+** — footer (KK layout) + /terms, /privacy, /responsible-gambling pages (modelled on RekoJ's, written for what TEGENS actually does). Optional later: an 18+ check on first visit
- [ ] **FAQ / Support** — sign-up, referrals, rewards, giveaways, account help
- [x] **Account Linking** — Kick + Discord linked on one account (/profile → Linked accounts)
