import { useState } from 'react'
import { metaLine } from '../lib/util.js'
import { getCfg } from '../lib/ai.js'
import { checkToken, getText, putFile, deleteFile, getMeta } from '../lib/github.js'

// 正确 UTF-8 → base64（与 App.jsx 上传端保持一致）
function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

export default function Lightbox({ photo, onClose }) {
  if (!photo) return null
  const base = import.meta.env.BASE_URL || '/'
  const [busy, setBusy] = useState(false)

  async function handleDelete(e) {
    e.stopPropagation()
    const cfg = getCfg()
    if (!cfg.ghToken) {
      alert('请先在「设置」里填写 GitHub token')
      return
    }
    if (!confirm(`确定要删除「${photo.title || photo.id}」吗？\n\n此操作会从仓库里删除源图、缩略图、大图，以及 captions.json 里的描述。不可撤销。`)) {
      return
    }
    setBusy(true)
    try {
      const tokErr = await checkToken(cfg.ghToken)
      if (tokErr) throw new Error(tokErr)

      const fileName = photo.src  // 例如 "17.jpg"
      const photoPath = `public/photos/${fileName}`

      // 1. 取源图 sha 并删除
      const meta = await getMeta(cfg.ghToken, photoPath)
      if (meta) {
        await deleteFile(cfg.ghToken, photoPath, meta.sha, `相册：删除 ${fileName}`)
      }

      // 2. 从 captions.json 删除条目
      const captionsText = await getText(cfg.ghToken, 'public/photos/captions.json')
      if (captionsText) {
        const captions = JSON.parse(captionsText)
        if (captions[fileName]) {
          delete captions[fileName]
          await putFile(
            cfg.ghToken,
            'public/photos/captions.json',
            utf8ToBase64(JSON.stringify(captions, null, 2)),
            `相册：移除 ${fileName} 描述`,
          )
        }
      }

      alert('已删除，刷新页面查看（相册约 1-2 分钟后自动更新）')
      onClose()
      // 强制刷新 manifest
      setTimeout(() => location.reload(), 200)
    } catch (err) {
      alert('删除失败：' + err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div id="lightbox" onClick={onClose}>
      <img src={base + photo.large} alt={photo.title} onClick={(e) => e.stopPropagation()} />
      <div className="cap" onClick={(e) => e.stopPropagation()}>
        <div className="t">{photo.title || ''}</div>
        <div className="c">{photo.caption || ''}</div>
        <div className="m">{metaLine(photo)}</div>
        <div className="ops">
          <button className="del" onClick={handleDelete} disabled={busy}>
            {busy ? '删除中…' : '删除这张'}
          </button>
        </div>
      </div>
    </div>
  )
}