/** 逆地理编码（Nominatim，失败静默返回 null） */
export function reverseGeo(lat, lon) {
  return new Promise((res) => {
    const ctrl = new AbortController()
    const to = setTimeout(() => {
      ctrl.abort()
      res(null)
    }, 4000)
    fetch(
      'https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=' + lat + '&lon=' + lon + '&accept-language=zh',
      { signal: ctrl.signal, headers: { Accept: 'application/json' } },
    )
      .then((r) => r.json())
      .then((j) => {
        clearTimeout(to)
        res(j && j.display_name ? j.display_name.split(',').slice(0, 2).join(' ').trim() : null)
      })
      .catch(() => {
        clearTimeout(to)
        res(null)
      })
  })
}
