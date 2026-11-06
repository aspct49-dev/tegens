import { useAuth } from './useAuth'
import { maskName } from '../utils'

// Leaderboard names are shown masked ("Mysti***") to the public; signed-in admins see them
// in full. Usage: const mask = useNameMask(); mask(player.name)
// (The leaderboard API already sends full names, so this is presentation only, not a secret.)
const plain = (name) => name

export function useNameMask() {
  const { admin } = useAuth()
  return admin ? plain : maskName
}
