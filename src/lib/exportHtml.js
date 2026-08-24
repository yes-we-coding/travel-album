import { esc } from './util.js'

export function metaLine(p) {
  const bits = []
  if (p.meta.dt) bits.push(p.meta.dt.replace(' ', ', ').replace(/\//g, '-'))
  if (p.meta.place) bits.push(p.meta.place)
  else if (p.meta.gps) bits.push(p.meta.gps.lat.toFixed(2) + ', ' + p.meta.gps.lon.toFixed(2))
  return bits.join(' · ')
}

/** 生成独立的静态相册 HTML 并下载 */
export function exportStaticAlbum(sorted, urls) {
  const figs = sorted
    .map((p, i) => {
      const ml = metaLine(p)
      return (
        '<figure><img src="' + urls[i] + '" alt=""><figcaption><div class="t">' + esc(p.title) + '</div><div class="c">' + esc(p.caption) + '</div>' + (ml ? '<div class="m">' + esc(ml) + '</div>' : '') + '</figcaption></figure>'
      )
    })
    .join('\n')
  const html =
    '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>行摄集 · 我的旅行相册</title><style>' +
    'body{background:#0f1115;color:#e6e8ee;font-family:"PingFang SC","Microsoft YaHei",system-ui,sans-serif;margin:0}' +
    'header{max-width:1100px;margin:0 auto;padding:48px 20px 8px}h1{letter-spacing:3px}h1 span{color:#e8a15c}' +
    '.sub{color:#8b93a3;font-size:13px;margin-top:6px}' +
    'main{max-width:1100px;margin:0 auto;padding:24px 20px 80px;columns:320px;column-gap:18px}' +
    'figure{break-inside:avoid;margin:0 0 18px;background:#171a21;border:1px solid #2a2f3a;border-radius:12px;overflow:hidden}' +
    'img{width:100%;display:block}figcaption{padding:12px 14px}.t{font-weight:600;margin-bottom:6px}' +
    '.c{color:#8b93a3;font-size:13px;line-height:1.8}.m{color:#5c6472;font-size:11px;margin-top:8px}</style></head><body>' +
    '<header><h1>行摄<span>集</span></h1><div class="sub">共 ' + sorted.length + ' 张照片 · 导出自旅行相册</div></header><main>' + figs + '</main></body></html>'
  const blob = new Blob([html], { type: 'text/html' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = '我的旅行相册.html'
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}
