// Shared formatting helpers.

export const fmtMoney = (n, decimals = 0) =>
  '$' +
  Number(n).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })

// Mask a username for privacy: "BlazeKing" -> "B*******g"
export const maskName = (name) => {
  if (!name) return ''
  if (name.length <= 2) return name[0] + '*'
  const stars = '*'.repeat(Math.max(1, name.length - 2))
  return name[0] + stars + name[name.length - 1]
}

export const initials = (name) => (name ? name[0].toUpperCase() : '?')
