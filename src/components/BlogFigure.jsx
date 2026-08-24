import { metaLine } from '../lib/exportHtml.js'

export default function BlogFigure({ photo, onOpen }) {
  const ml = metaLine(photo)
  return (
    <figure onClick={() => onOpen(photo)}>
      <img src={photo.url} alt={photo.title} loading="lazy" />
      <figcaption>
        <div className="t">{photo.title || '未命名'}</div>
        <div className="c">{photo.caption || ''}</div>
        {ml && <div className="m">{ml}</div>}
      </figcaption>
    </figure>
  )
}
