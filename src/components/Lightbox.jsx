import { metaLine } from '../lib/exportHtml.js'

export default function Lightbox({ photo, onClose }) {
  if (!photo) return null
  return (
    <div id="lightbox" onClick={onClose}>
      <img src={photo.url} alt={photo.title} />
      <div className="cap">
        <div className="t">{photo.title || ''}</div>
        <div className="c">{photo.caption || ''}</div>
        <div className="m">{metaLine(photo)}</div>
      </div>
    </div>
  )
}
