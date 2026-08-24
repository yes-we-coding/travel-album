import { pick } from './util.js'

/** 画面色彩分析：亮度 + 蓝/绿/暖色占比 */
export function analyzeImage(img) {
  try {
    const c = document.createElement('canvas')
    c.width = 24
    c.height = 24
    const ctx = c.getContext('2d')
    ctx.drawImage(img, 0, 0, 24, 24)
    const d = ctx.getImageData(0, 0, 24, 24).data
    let lum = 0
    let blue = 0
    let green = 0
    let warm = 0
    const total = d.length / 4
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i] / 255
      const g = d[i + 1] / 255
      const b = d[i + 2] / 255
      const mx = Math.max(r, g, b)
      const mn = Math.min(r, g, b)
      const l = (mx + mn) / 2
      lum += l
      const s = mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1))
      if (s > 0.18) {
        let h
        if (mx === r) h = ((g - b) / (mx - mn)) % 6
        else if (mx === g) h = (b - r) / (mx - mn) + 2
        else h = (r - g) / (mx - mn) + 4
        h *= 60
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

/** 兜底文案生成（无 AI 配置时使用） */
export function heuristicCaption(meta, an) {
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

export function defaultTitle(meta) {
  if (meta.place) return meta.place
  if (meta.dt) {
    return meta.dt.replace(/^(\d{4})[:/](\d{2})[:/](\d{2}).*/, '$1年$2月$3日') + ' 的旅行'
  }
  return '未命名旅程'
}
