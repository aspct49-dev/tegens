import { SectionIntro } from '../ui'
import { WatchPoints } from './Shop'

// Botrix Points: give or take a viewer's BotRix (watch) points by Kick username.
// The same desk as Watch Store → Points (server/features/shop.js, /api/admin/shop/points),
// as its own section so it's one click away. Players → a player → "Give Botrix points"
// opens it with ?kick=<name>, and that viewer is looked up straight away.

export default function PointsAdmin() {
  const kick = new URLSearchParams(window.location.search).get('kick') ?? ''
  return (
    <>
      <SectionIntro>
        Give or take a viewer’s <b>BotRix points</b> on the Kick channel. Look them up by Kick username, pick an amount, say why, then Add.
        Every change goes in the log below with who made it.
      </SectionIntro>
      <WatchPoints key={kick} initialName={kick} />
    </>
  )
}
