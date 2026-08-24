import { metaLine } from '../lib/util.js'

export default function Lightbox({ photo, onClose }) {
  if (!photo) return null
  const base = import.meta.env.BASE_URL || '/'
  return (
    <div id="lightbox" onClick={onClose}>
      <img src={base + photo.large} alt={photo.title} />
      <div className="cap">
        <div className="t">{photo.title || ''}</div>
        <div className="c">{photo.caption || ''}</div>
        <div className="m">{metaLine(photo)}</div>
      </div>
    </div>
  )
}
