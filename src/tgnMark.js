// The TGN logo (public/assets/tgn-logo.png) as ink for light surfaces: the raffle balls
// (BubbleMachine, BallViewer). The site logo is light grey with a blue bar, made for dark
// backgrounds, so the grey letters are recoloured to dark navy and the blue bar is kept.
// The result is cropped to the logo's own bounds, so callers can size it by height.
//
//   loadTgnMark()  → Promise<canvas>, loaded once
//   tgnMark()      → the canvas once loaded, else null (for synchronous painters)

const SRC = '/assets/tgn-logo.png'
const INK = [11, 18, 24] // #0b1218, the ball text colour

let mark = null
let loading = null

export const tgnMark = () => mark

export function loadTgnMark() {
  loading ??= new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('TGN logo failed to load'))
    img.src = SRC
  })
    .then((img) => {
      const src = document.createElement('canvas')
      src.width = img.naturalWidth
      src.height = img.naturalHeight
      const g = src.getContext('2d', { willReadFrequently: true })
      g.drawImage(img, 0, 0)
      const data = g.getImageData(0, 0, src.width, src.height)
      const px = data.data
      let x0 = src.width
      let y0 = src.height
      let x1 = -1
      let y1 = -1
      for (let i = 0; i < px.length; i += 4) {
        const a = px[i + 3]
        if (a < 12) continue
        const p = i / 4
        const x = p % src.width
        const y = (p - x) / src.width
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
        const [r, gr, b] = [px[i], px[i + 1], px[i + 2]]
        // the blue bar stays; everything grey (the letters and their soft shadow) becomes ink
        if (b - Math.max(r, gr) > 30) continue
        px[i] = INK[0]
        px[i + 1] = INK[1]
        px[i + 2] = INK[2]
      }
      g.putImageData(data, 0, 0)
      if (x1 < x0) throw new Error('TGN logo is empty')
      const out = document.createElement('canvas')
      out.width = x1 - x0 + 1
      out.height = y1 - y0 + 1
      out.getContext('2d').drawImage(src, x0, y0, out.width, out.height, 0, 0, out.width, out.height)
      mark = out
      return out
    })
    .catch((err) => {
      loading = null // let the next caller try again
      throw err
    })
  return loading
}

/** Draw the mark centred on (cx, cy) at height h; false when it isn't loaded yet */
export function drawTgnMark(g, cx, cy, h) {
  if (!mark) return false
  const w = (h * mark.width) / mark.height
  g.drawImage(mark, cx - w / 2, cy - h / 2, w, h)
  return true
}
