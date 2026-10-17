export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/** 正确 UTF-8 → base64（TextEncoder 编为 UTF-8 字节再 btoa，避免中文二次编码乱码） */
export function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

export function pick(a) {
  return a[Math.floor(Math.random() * a.length)]
}

export function esc(s) {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function metaLine(p) {
  const bits = []
  if (p.dt) bits.push(p.dt.replace(' ', ', ').replace(/\//g, '-'))
  if (p.place) bits.push(p.place)
  else if (p.gps) bits.push(p.gps.lat.toFixed(2) + ', ' + p.gps.lon.toFixed(2))
  return bits.join(' · ')
}
