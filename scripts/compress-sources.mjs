// 源图压缩：超过阈值的原图原地重编码（保留 EXIF 时间/GPS），PNG/WebP 源转 JPG
// 并同步 captions.json 的 key。缩略图/大图/LQIP 会在下次构建时按新源自动重建。
// 用法: node scripts/compress-sources.mjs   （或 npm run compress）
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const photosDir = path.join(root, 'public/photos')
const EXT = /\.(jpe?g|png|webp)$/i

const MAX_W = 3000 // 长边上限（px）
const QUALITY = 88 // JPEG mozjpeg 质量
const MIN_BYTES = 2 * 1024 * 1024 // 超过 2MB 才处理

const loadJson = (p, fb) => {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {
    return fb
  }
}
const captionsPath = path.join(photosDir, 'captions.json')
const captions = loadJson(captionsPath, {})
let captionsDirty = false

const files = fs
  .readdirSync(photosDir)
  .filter((f) => EXT.test(f) && fs.statSync(path.join(photosDir, f)).isFile())
  .sort()

let savedTotal = 0
for (const file of files) {
  const srcPath = path.join(photosDir, file)
  const buf = fs.readFileSync(srcPath)
  const md = await sharp(buf).metadata()
  const tooBig = buf.length > MIN_BYTES || md.width > MAX_W
  const isJpeg = /\.jpe?g$/i.test(file)
  if (!tooBig && isJpeg) continue

  const stem = path.parse(file).name
  const out = await sharp(buf)
    .rotate() // 按 EXIF 方向转正像素
    .resize({ width: MAX_W, withoutEnlargement: true })
    .flatten({ background: '#ffffff' }) // PNG 透明通道压白
    .withMetadata({ orientation: 1 }) // 保留 EXIF（时间/GPS），方向标记归位
    .jpeg({ quality: QUALITY, mozjpeg: true })
    .toBuffer()

  if (isJpeg && out.length >= buf.length) {
    console.log(`  = ${file} 已足够小，跳过`)
    continue
  }

  let finalName = file
  if (!isJpeg) {
    // PNG/WebP → JPG：换扩展名，同步 captions.json 的 key（manifest 的 id 是 stem，不受影响）
    finalName = stem + '.jpg'
    if (captions[file]) {
      captions[finalName] = captions[file]
      delete captions[file]
      captionsDirty = true
    }
    fs.rmSync(srcPath)
  }
  fs.writeFileSync(path.join(photosDir, finalName), out)

  const saved = buf.length - out.length
  savedTotal += saved
  console.log(
    `  ✓ ${file}${finalName !== file ? ' → ' + finalName : ''}：${(buf.length / 1048576).toFixed(1)}MB → ${(out.length / 1048576).toFixed(1)}MB`,
  )
}

if (captionsDirty) fs.writeFileSync(captionsPath, JSON.stringify(captions, null, 2))
console.log(savedTotal > 0 ? `完成，共省下 ${(savedTotal / 1048576).toFixed(1)}MB。` : '没有需要压缩的源图。')
