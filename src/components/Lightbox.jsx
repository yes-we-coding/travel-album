import { useState } from 'react'
import { metaLine } from '../lib/util.js'
import { getCfg } from '../lib/ai.js'
import { checkToken, commitFiles } from '../lib/github.js'

export default function Lightbox({ photo, onClose, onDeleted }) {
  const [busy, setBusy] = useState(false)
  const base = import.meta.env.BASE_URL || '/'

  if (!photo) return null

  async function handleDelete(e) {
    e.stopPropagation()
    const cfg = getCfg()
    if (!cfg.ghToken) {
      alert('请先在「设置」里填写 GitHub token')
      return
    }
    if (!confirm(`确定要删除「${photo.title || photo.id}」吗？\n\n此操作会从仓库里删除源图（缩略图 / 大图会随下次构建自动清理），以及 captions.json 里的描述。不可撤销。`)) {
      return
    }
    setBusy(true)
    try {
      const tokErr = await checkToken(cfg.ghToken)
      if (tokErr) throw new Error(tokErr)

      const fileName = photo.src // 例如 "17.jpg"
      // 单 commit：删源图 + 合并 captions（缩略图 / 大图是构建产物，会随重新部署消失）
      await commitFiles(cfg.ghToken, {
        message: `相册：删除 ${fileName}`,
        deletes: [`public/photos/${fileName}`],
        edits: {
          'public/photos/captions.json': (cur) => {
            if (!cur) return null
            const caps = JSON.parse(cur)
            if (!(fileName in caps)) return null
            delete caps[fileName]
            return JSON.stringify(caps, null, 2)
          },
        },
      })

      onClose()
      if (onDeleted) onDeleted(photo.id)
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
