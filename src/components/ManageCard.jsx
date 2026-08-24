import { useEffect, useRef, useState } from 'react'
import { metaLine } from '../lib/exportHtml.js'
import { aiCaption, downscaledDataURL } from '../lib/ai.js'
import { analyzeImage, heuristicCaption } from '../lib/analyze.js'

export default function ManageCard({ photo, onTitleChange, onCaptionChange, onDelete, onRegenerated, toast }) {
  const [busy, setBusy] = useState(false)

  const regen = async () => {
    setBusy(true)
    try {
      const img = new Image()
      const t = await new Promise((res) => {
        const finish = async (src) => {
          const ai = src ? await aiCaption(src, toast) : null
          res(ai || heuristicCaption(photo.meta, src ? analyzeImage(img) : { lum: 128, blue: 0, green: 0, warm: 0 }))
        }
        img.onload = () => finish(downscaledDataURL(img, 1024))
        img.onerror = () => finish(null)
        img.src = photo.url
      })
      onRegenerated(photo.id, t)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <img src={photo.url} alt={photo.title} />
      <div className="body">
        <input
          className="title"
          defaultValue={photo.title}
          onInput={(e) => onTitleChange(photo.id, e.target.value)}
        />
        <textarea defaultValue={photo.caption} onInput={(e) => onCaptionChange(photo.id, e.target.value)} />
        <div className="meta">{metaLine(photo) || ' '}</div>
        <div className="ops">
          <button onClick={regen} disabled={busy}>
            {busy ? '生成中…' : '重新生成描述'}
          </button>
          <button
            className="del"
            onClick={() => {
              if (confirm('删除这张照片？')) onDelete(photo.id)
            }}
          >
            删除
          </button>
        </div>
      </div>
    </div>
  )
}
