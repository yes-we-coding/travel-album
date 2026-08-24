function exifString(dv, o, len) {
  let s = ''
  for (let i = 0; i < len; i++) {
    const c = dv.getUint8(o + i)
    if (c === 0) break
    s += String.fromCharCode(c)
  }
  return s
}

/** 解析 JPEG EXIF：拍摄时间 + GPS */
export function parseExif(buf) {
  try {
    const dv = new DataView(buf)
    if (dv.byteLength < 4 || dv.getUint16(0) !== 0xffd8) return null
    let off = 2
    while (off + 4 < dv.byteLength) {
      const m = dv.getUint16(off)
      if ((m & 0xff00) !== 0xff00) break
      const len = dv.getUint16(off + 2)
      if (m === 0xffe1) {
        const start = off + 4
        if (exifString(dv, start, 6) !== 'Exif\0\0') return null
        const tiff = start + 6
        const little = dv.getUint16(tiff) === 0x4949
        const g16 = (o) => dv.getUint16(tiff + o, little)
        const g32 = (o) => dv.getUint32(tiff + o, little)
        const out = { dt: null, gps: null }
        const ifd0 = tiff + g32(4)
        let exifPtr = 0
        let gpsPtr = 0
        const n = g16(ifd0)
        let i, e, t
        for (i = 0; i < n; i++) {
          e = ifd0 + 2 + i * 12
          t = g16(e)
          if (t === 0x8769) exifPtr = g32(e + 8)
          else if (t === 0x8825) gpsPtr = g32(e + 8)
        }
        if (exifPtr) {
          const p = tiff + exifPtr
          const m2 = g16(p)
          for (i = 0; i < m2; i++) {
            e = p + 2 + i * 12
            t = g16(e)
            if (t === 0x9003 || t === 0x9004) {
              out.dt = exifString(dv, tiff + g32(e + 8), 19)
              break
            }
          }
        }
        if (gpsPtr) {
          const gp = tiff + gpsPtr
          const m3 = g16(gp)
          let lat = null
          let lon = null
          let latRef = 'N'
          let lonRef = 'E'
          const rats = (o) => {
            const v = []
            for (let k = 0; k < 3; k++) {
              const a = g32(o + k * 8)
              const b = g32(o + k * 8 + 4)
              v.push(b ? a / b : 0)
            }
            return v
          }
          for (i = 0; i < m3; i++) {
            e = gp + 2 + i * 12
            t = g16(e)
            const o2 = g32(e + 8)
            if (t === 1) latRef = exifString(dv, tiff + o2, 1)
            else if (t === 2) lat = rats(tiff + o2)
            else if (t === 3) lonRef = exifString(dv, tiff + o2, 1)
            else if (t === 4) lon = rats(tiff + o2)
          }
          if (lat && lon) {
            const d = (v) => v[0] + v[1] / 60 + v[2] / 3600
            out.gps = {
              lat: d(lat) * (latRef === 'S' ? -1 : 1),
              lon: d(lon) * (lonRef === 'W' ? -1 : 1),
            }
          }
        }
        return out
      }
      off += 2 + len
    }
  } catch {
    /* ignore */
  }
  return null
}
