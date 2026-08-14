// ============================================================================
//  SLOT CATALOGUE METADATA  (the /slots picker)
// ----------------------------------------------------------------------------
//  The games themselves live in /public/slots.json — 3,750 titles across the
//  24 providers Rainbet carries, fetched only when someone opens the picker so
//  it costs nothing on every other page.
//
//  TO REFRESH THE CATALOGUE: regenerate /public/slots.json. Shape is
//    [ { "name": "...", "provider": "...", "img": "...", "url": "..." } ]
//  `img` and `url` are optional — without `url` the play button falls back to
//  the referral link in config.casinoUrl.
//
//  WHEN REFRESHING, strip operator-exclusive reskins — casinos commission
//  branded builds of popular games that only exist on their own site. These
//  four were removed because they're Roobet-only; each one's base game is in
//  the catalogue already, so nothing is lost:
//    Roo Bonanza (vs20fruitswroo → Sweet Bonanza vs20fruitsw)
//    The Roo House (vs20roohouse → The Dog House vs20doghouse)
//    RIP City Roobet (hacksaw:1955 → RIP City hacksaw:1233)
//    Roobet Gems of Fortune
//  The tell is the game code in the image path, not the title — "Rooster
//  Rumble", "Wombaroo" and "Froot Loot" all match a naive name search and are
//  perfectly real games.
//
//  Provider names must match the `provider` values in that file exactly, or
//  the chip won't line up with any games.
// ============================================================================

// Display order (alphabetical, as Rainbet lists them) plus the accent colour
// used for each chip's dot. Colours are spaced around the wheel and lifted for
// legibility on the dark navy panel.
export const providers = [
  { name: '3 Oaks Gaming',   color: '#6ee7a8' },
  { name: 'AvatarUX',        color: '#4dd6c1' },
  { name: 'Backseat Gaming', color: '#ff6b9d' },
  { name: 'BGaming',         color: '#7c8cff' },
  { name: 'Big Time Gaming', color: '#5aa3ff' },
  { name: 'Booming Games',   color: '#ffb454' },
  { name: 'Bullshark Games', color: '#b98cff' },
  { name: 'ELK Studios',     color: '#ff7a59' },
  { name: 'Gameburger',      color: '#8fe36b' },
  { name: 'Games Global',    color: '#ff5fa2' },
  { name: 'Gaming Corps',    color: '#4ade80' },
  { name: 'Hacksaw Gaming',  color: '#ffd166' },
  { name: 'Nolimit City',    color: '#c77dff' },
  { name: 'Penguin King',    color: '#ff8fa3' },
  { name: 'Peter & Sons',    color: '#5ad1ff' },
  { name: 'PG Soft',         color: '#a78bfa' },
  { name: "Play'n Go",       color: '#7dd3fc' },
  { name: 'Popiplay',        color: '#f472b6' },
  { name: 'Pragmatic Play',  color: '#34d399' },
  { name: 'Push Gaming',     color: '#22d3ee' },
  { name: 'Relax',           color: '#60a5fa' },
  { name: 'Slotmill',        color: '#f87171' },
  { name: 'Thunderkick',     color: '#fbbf24' },
  { name: 'True Labs',       color: '#a3e635' },
]

export const providerColor = (name) =>
  providers.find((p) => p.name === name)?.color || '#5aa3ff'

// Shown only if /slots.json can't be loaded, so the picker degrades to
// something usable instead of an empty reel.
export const fallbackSlots = [
  { name: 'Gates of Olympus',     provider: 'Pragmatic Play' },
  { name: 'Sweet Bonanza',        provider: 'Pragmatic Play' },
  { name: 'Sugar Rush',           provider: 'Pragmatic Play' },
  { name: 'Wanted Dead or a Wild', provider: 'Hacksaw Gaming' },
  { name: 'Le Bandit',            provider: 'Hacksaw Gaming' },
  { name: 'Mental',               provider: 'Nolimit City' },
  { name: 'Fire in the Hole xBomb', provider: 'Nolimit City' },
  { name: 'Book of Dead',         provider: "Play'n Go" },
  { name: 'Reactoonz',            provider: "Play'n Go" },
  { name: 'Razor Shark',          provider: 'Push Gaming' },
  { name: "Jammin' Jars",         provider: 'Push Gaming' },
  { name: 'Money Train 4',        provider: 'Relax' },
  { name: 'Nitropolis 4',         provider: 'ELK Studios' },
  { name: 'Bonanza Megaways',     provider: 'Big Time Gaming' },
  { name: 'Fortune Tiger',        provider: 'PG Soft' },
  { name: 'Elvis Frog in Vegas',  provider: 'BGaming' },
]
