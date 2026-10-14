// Shared formatting helpers.

export const fmtMoney = (n, decimals = 0) =>
  '$' +
  Number(n).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })

// Mask a username for privacy, matching the design: "TegensKing" -> "Tegens***"
export const maskName = (name) => {
  if (!name) return ''
  const keep = Math.max(1, Math.min(6, Math.ceil(name.length / 2)))
  return name.slice(0, keep) + '***'
}

export const pad = (n) => String(n).padStart(2, '0')
