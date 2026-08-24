import { metaLine } from '../lib/util.js'

export default function BlogFigure({ photo, onOpen }) {
  const base = import.meta.env.BASE_URL || '/'
  const ml = metaLine(photo)
  return (
    <figure onClick={() => onOpen(photo)}>
      <img src={base + photo.thumb} alt={photo.title} loading="lazy" width={photo.w} height={photo.h} />
      <figcaption>
        <div className="t">{photo.title || '未命名'}</div>
        <div className="c">{photo.caption || ''}</div>
        {ml && <div className="m">{ml}</div>}
      </figcaption>
    </figure>
  )
}
