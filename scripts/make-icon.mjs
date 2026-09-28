// Makes the app icon from the UCC logo: the UCC mark alone (the full logo's text is unreadable at
// 16–32 px), centred on a square white tile. Run once when the logo changes, then commit the output:
//
//   npx electron scripts/make-icon.mjs
//
// Writes resources/icon.png (512 px, for electron-builder) and resources/icon.ico (16–256 px).
// Runs inside Electron for nativeImage (decode, crop, resize), so no image library is needed.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, nativeImage } from 'electron'

const ROOT = join(import.meta.dirname, '..')
const LOGO = join(ROOT, 'src/renderer/src/assets/logo.jpeg')
/** Rows of the logo holding the UCC mark: below the olive banner, above "SUPPLY & TRADING". */
const MARK_ROWS = [90, 222]
/** The mark's width as a share of the tile. */
const FILL = 0.86
const SIZES = [16, 24, 32, 48, 64, 128, 256]
/** Up to this size the .ico holds plain bitmaps (read by every tool, NSIS included); above, PNG. */
const MAX_BMP = 128

/** Bounding box of the non-white pixels in the mark's rows. */
function markBox(bitmap, width) {
  let left = width
  let right = -1
  let top = MARK_ROWS[1]
  let bottom = -1
  for (let y = MARK_ROWS[0]; y < MARK_ROWS[1]; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if ((bitmap[i] + bitmap[i + 1] + bitmap[i + 2]) / 3 < 235) {
        left = Math.min(left, x)
        right = Math.max(right, x)
        top = Math.min(top, y)
        bottom = Math.max(bottom, y)
      }
    }
  }
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }
}

/** The mark centred on a white square of `side` px (BGRA). */
function tile(mark, side) {
  const markWidth = Math.round(side * FILL)
  const markHeight = Math.round((mark.getSize().height * markWidth) / mark.getSize().width)
  const scaled = mark.resize({ width: markWidth, height: markHeight, quality: 'best' })
  const src = scaled.toBitmap()
  const out = Buffer.alloc(side * side * 4, 255)
  const left = Math.floor((side - markWidth) / 2)
  const top = Math.floor((side - markHeight) / 2)
  for (let y = 0; y < markHeight; y++) {
    src.copy(out, ((top + y) * side + left) * 4, y * markWidth * 4, (y + 1) * markWidth * 4)
  }
  return nativeImage.createFromBitmap(out, { width: side, height: side })
}

/** A 32-bit bitmap icon entry: BITMAPINFOHEADER, BGRA rows bottom-up, then an empty AND mask. */
function bmpEntry(image, side) {
  const bgra = image.toBitmap()
  const header = Buffer.alloc(40)
  header.writeUInt32LE(40, 0)
  header.writeInt32LE(side, 4)
  header.writeInt32LE(side * 2, 8) // colour + mask
  header.writeUInt16LE(1, 12)
  header.writeUInt16LE(32, 14)
  const rows = []
  for (let y = side - 1; y >= 0; y--) {
    const row = Buffer.from(bgra.subarray(y * side * 4, (y + 1) * side * 4))
    for (let x = 3; x < row.length; x += 4) row[x] = 255 // opaque
    rows.push(row)
  }
  const maskRow = Math.ceil(side / 32) * 4
  return Buffer.concat([header, ...rows, Buffer.alloc(maskRow * side)])
}

function ico(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  const entries = []
  const data = []
  let offset = 6 + 16 * images.length
  for (const { side, bytes } of images) {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(side >= 256 ? 0 : side, 0)
    entry.writeUInt8(side >= 256 ? 0 : side, 1)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(bytes.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += bytes.length
    entries.push(entry)
    data.push(bytes)
  }
  return Buffer.concat([header, ...entries, ...data])
}

app.whenReady().then(() => {
  const logo = nativeImage.createFromPath(LOGO)
  if (logo.isEmpty()) throw new Error(`Cannot read ${LOGO}`)
  const box = markBox(logo.toBitmap(), logo.getSize().width)
  const mark = logo.crop(box)
  console.log(`UCC mark: ${box.width}×${box.height} at ${box.x},${box.y}`)

  writeFileSync(join(ROOT, 'resources/icon.png'), tile(mark, 512).toPNG())
  const images = SIZES.map((side) => {
    const image = tile(mark, side)
    return { side, bytes: side <= MAX_BMP ? bmpEntry(image, side) : image.toPNG() }
  })
  writeFileSync(join(ROOT, 'resources/icon.ico'), ico(images))
  console.log('Wrote resources/icon.png and resources/icon.ico')
  app.quit()
})
