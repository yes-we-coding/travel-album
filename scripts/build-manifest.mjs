// 构建期清单生成：扫描 public/photos/ 下的源图，
// 提取 EXIF（时间/地点）→ 生成缩略图/大图 → 写描述文案 → 输出 manifest.json
// 用法: node scripts/build-manifest.mjs
// 可选 env: TRAVEL_AI_BASE / TRAVEL_AI_KEY / TRAVEL_AI_MODEL 用视觉模型写文案（结果缓存）

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import exifr from 'exifr'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const photosDir = path.join(root, 'public/photos')
const thumbsDir = path.join(photosDir, 'thumbs')
const largeDir = path.join(photosDir, 'large')
const EXT = /\.(jpe?g|png|webp)$/i

fs.mkdirSync(thumbsDir, { recursive: true })
fs.mkdirSync(largeDir, { recursive: true })

/* ---------- 工具 ---------- */
const pick = (a) => a[Math.floor(Math.random() * a.length)]

async function analyze(buf) {
  try {
    const { data } = await sharp(buf)
      .resize({ width: 24, height: 24, fit: 'cover' })
      .raw()
      .ensureAlpha()
      .toBuffer({ resolveWithObject: true })
    let lum = 0
    let blue = 0
    let green = 0
    let warm = 0
    const total = data.length / 4
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] / 255
      const g = data[i + 1] / 255
      const b = data[i + 2] / 255
      const mx = Math.max(r, g, b)
      const mn = Math.min(r, g, b)
      const l = (mx + mn) / 2
      lum += l
      const s = mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1))
      if (s > 0.18) {
        let h
        if (mx === r) h = (((g - b) / (mx - mn)) % 6) * 60
        else if (mx === g) h = ((b - r) / (mx - mn) + 2) * 60
        else h = ((r - g) / (mx - mn) + 4) * 60
        if (h < 0) h += 360
        if (h >= 190 && h <= 260) blue++
        else if (h >= 75 && h <= 170) green++
        else if (h <= 45 || h >= 330) warm++
      }
    }
    return { lum: (lum / total) * 255, blue: blue / total, green: green / total, warm: warm / total }
  } catch {
    return { lum: 128, blue: 0, green: 0, warm: 0 }
  }
}

function heuristicCaption(meta, an) {
  const parts = []
  parts.push(pick(['路上的某一瞬，', '快门按下的那一刻，', '走着走着，', '没什么特别的理由，', '偶然抬头，']))
  if (an.blue > 0.22) parts.push(pick(['天空澄澈，云也走得慢。', '抬头是一片通透的蓝。', '天很高，风很轻。']))
  if (an.green > 0.18) parts.push(pick(['满目绿意，风里都是草木的味道。', '山野把绿色一直铺到天边。', '草木正好，生机扑面。']))
  if (an.warm > 0.22) parts.push(pick(['暖光给一切都镀了边。', '夕阳调了个温柔的色调。', '橙黄的光落在路上，人也慢了下来。']))
  if (parts.length === 1) {
    if (an.lum > 170) parts.push(pick(['阳光正好，适合漫无目的地走。', '光线明亮，心情也跟着敞亮。']))
    else if (an.lum < 80) parts.push(pick(['夜色安静，灯火星稀。', '暗下来的世界反而更清晰。']))
    else parts.push(pick(['光线柔和，一切都刚刚好。', '不浓不淡的光，最适合记录。']))
  }
  let hour = null
  if (meta.dt) {
    const hm = meta.dt.match(/(\d{2}):\d{2}:\d{2}/)
    if (hm) hour = +hm[1]
  }
  if (hour !== null) {
    if (hour >= 5 && hour < 8) parts.push('清晨出发，整个世界还没醒。')
    else if (hour >= 17 && hour < 19) parts.push('黄昏时分，影子被拉得很长。')
    else if (hour >= 19 || hour < 5) parts.push('夜里的行程，别有滋味。')
  }
  parts.push(pick(['就想把这一刻留下来。', '旅行的意义大抵如此。', '留个纪念，日后慢慢想起。', '']))
  return parts.filter(Boolean).join('')
}

function defaultTitle(meta, filename) {
  if (meta.place) return meta.place
  if (meta.dt) return meta.dt.replace(/^(\d{4})[:/](\d{2})[:/](\d{2}).*/, '$1年$2月$3日') + ' 的旅行'
  return filename
}

/* ---------- 缓存 ---------- */
function loadJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {
    return fallback
  }
}
function saveJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2))
}

const geoCache = loadJson(path.join(root, 'scripts/geo-cache.json'), {})
const aiCache = loadJson(path.join(root, 'scripts/ai-cache.json'), {})

async function reverseGeo(lat, lon) {
  const key = lat.toFixed(4) + ',' + lon.toFixed(4)
  if (key in geoCache) return geoCache[key]
  try {
    const ctrl = new AbortController()
    const to = setTimeout(() => ctrl.abort(), 5000)
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=zh`,
      { signal: ctrl.signal, headers: { Accept: 'application/json', 'User-Agent': 'travel-album-builder/1.0' } },
    )
    clearTimeout(to)
    const j = await r.json()
    let place = null
    if (j && j.display_name) place = j.display_name.split(',').slice(0, 2).join(' ').trim()
    geoCache[key] = place
    await new Promise((res) => setTimeout(res, 1100)) // Nominatim 限速 1 req/s
    return place
  } catch {
    return null
  }
}

async function aiCaption(downscaledBuf) {
  const base = process.env.TRAVEL_AI_BASE
  const key = process.env.TRAVEL_AI_KEY
  if (!base || !key) return null
  const url = base.replace(/\/+$/, '') + '/chat/completions'
  const model = process.env.TRAVEL_AI_MODEL || 'qwen-vl-max'
  const b64 = downscaledBuf.toString('base64')
  const body = {
    model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + b64 } },
          {
            type: 'text',
            text: '这是一张旅行照片。请用中文写一段 80 字左右的旅行手记风格描述：直接描写画面与当下的心境，不要列点，不要以“这张照片”开头，不要编造具体地名。',
          },
        ],
      },
    ],
    max_tokens: 300,
  }
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: '***' + key },
      body: JSON.stringify(body),
    })
    if (!r.ok) throw new Error('http ' + r.status)
    const j = await r.json()
    return (j.choices?.[0]?.message?.content || '').trim() || null
  } catch (err) {
    console.warn('  [warn] AI 调用失败: ' + err.message)
    return null
  }
}

/* ---------- 主流程 ---------- */
const captionsOverride = loadJson(path.join(photosDir, 'captions.json'), {})

const files = fs
  .readdirSync(photosDir)
  .filter((f) => EXT.test(f) && fs.statSync(path.join(photosDir, f)).isFile())
  .sort()

if (!files.length) {
  saveJson(path.join(photosDir, 'manifest.json'), [])
  console.log('public/photos/ 是空的，写了空 manifest。')
  process.exit(0)
}

console.log(`处理 ${files.length} 张照片…`)
const aiEnabled = !!(process.env.TRAVEL_AI_BASE && process.env.TRAVEL_AI_KEY)

const entries = []
for (const file of files) {
  const srcPath = path.join(photosDir, file)
  const stem = path.parse(file).name
  const st = fs.statSync(srcPath)
  const buf = fs.readFileSync(srcPath)
  const img = sharp(buf)
  const md = await img.metadata()

  // EXIF
  let ex = {}
  try {
    ex = (await exifr.parse(buf, { gps: true, pick: ['DateTimeOriginal', 'CreateDate', 'ModifyDate'] })) || {}
  } catch {
    /* ignore */
  }
  const dtRaw = ex.DateTimeOriginal || ex.CreateDate || null
  const dt = dtRaw ? new Date(dtRaw).toISOString().replace('T', ' ').slice(0, 19) : null
  const gps =
    typeof ex.latitude === 'number' && typeof ex.longitude === 'number'
      ? { lat: ex.latitude, lon: ex.longitude }
      : null

  // 缩略图 / 大图（缓存：已存在且比源新就跳过）
  const thumbPath = path.join(thumbsDir, stem + '.jpg')
  const largePath = path.join(largeDir, stem + '.jpg')
  if (!(fs.existsSync(thumbPath) && fs.statSync(thumbPath).mtimeMs > st.mtimeMs)) {
    await sharp(buf).rotate().resize({ width: 800, withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(thumbPath)
  }
  if (!(fs.existsSync(largePath) && fs.statSync(largePath).mtimeMs > st.mtimeMs)) {
    await sharp(buf).rotate().resize({ width: 1800, withoutEnlargement: true }).jpeg({ quality: 85 }).toFile(largePath)
  }

  // 文案：captions.json 覆盖 > AI（有缓存）> 本地兜底
  const ov = captionsOverride[file] || {}
  let place = ov.place ?? null
  if (place === null && gps) place = await reverseGeo(gps.lat, gps.lon)
  const meta = { dt, gps, place }

  let caption = ov.caption ?? null
  if (caption === null && aiEnabled) {
    const ck = `${file}|${st.size}|${st.mtimeMs}|${process.env.TRAVEL_AI_MODEL || 'qwen-vl-max'}`
    if (aiCache[ck]) caption = aiCache[ck]
    else {
      const small = await sharp(buf).rotate().resize({ width: 1024, withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer()
      caption = await aiCaption(small)
      if (caption) aiCache[ck] = caption
    }
  }
  if (caption === null) caption = heuristicCaption(meta, await analyze(buf))

  const title = ov.title ?? defaultTitle(meta, file)

  entries.push({
    id: stem,
    src: file,
    thumb: `photos/thumbs/${stem}.jpg`,
    large: `photos/large/${stem}.jpg`,
    w: md.width,
    h: md.height,
    dt,
    gps,
    place,
    title,
    caption,
  })
  console.log(`  ✓ ${file}` + (dt ? ` (${dt})` : '') + (place ? ` @${place}` : ''))
}

saveJson(path.join(root, 'scripts/geo-cache.json'), geoCache)
if (aiEnabled) saveJson(path.join(root, 'scripts/ai-cache.json'), aiCache)

entries.sort((a, b) => (a.dt || '').localeCompare(b.dt || '') || a.id.localeCompare(b.id))
saveJson(path.join(photosDir, 'manifest.json'), entries)
console.log(`manifest.json 已生成，共 ${entries.length} 条。`)
