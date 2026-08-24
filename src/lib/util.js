export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
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
