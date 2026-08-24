import { useEffect, useRef } from 'react'
import { getCfg, saveCfg } from '../lib/ai.js'

export default function SettingsDialog({ open, onClose, toast }) {
  const dialogRef = useRef(null)
  const ghRef = useRef(null)
  const baseRef = useRef(null)
  const keyRef = useRef(null)
  const modelRef = useRef(null)

  useEffect(() => {
    const dlg = dialogRef.current
    if (!dlg) return
    if (open && !dlg.open) {
      const cfg = getCfg()
      ghRef.current.value = cfg.ghToken || ''
      baseRef.current.value = cfg.base || ''
      keyRef.current.value = cfg.key || ''
      modelRef.current.value = cfg.model || ''
      dlg.showModal()
    } else if (!open && dlg.open) {
      dlg.close()
    }
  }, [open])

  const save = () => {
    const cfg = getCfg()
    cfg.ghToken = ghRef.current.value.trim()
    cfg.base = baseRef.current.value.trim()
    cfg.key = keyRef.current.value.trim()
    cfg.model = modelRef.current.value.trim()
    saveCfg(cfg)
    onClose()
    toast('设置已保存（只存在本机浏览器）')
  }

  return (
    <dialog ref={dialogRef} onCancel={onClose}>
      <h2>设置</h2>
      <p className="hint">
        上传照片需要 GitHub token（仓库 yes-we-coding/travel-album 的写权限）。
        生成方式：github.com/settings/tokens → Fine-grained tokens → Repository access 选
        travel-album → Permissions 勾选 Contents: Read and write。所有配置只保存在本机浏览器
        localStorage，不会传到任何地方。
      </p>
      <label>GitHub Token（上传照片必填）</label>
      <input ref={ghRef} type="password" placeholder="github_pat_..." />
      <label>AI API Base URL（可选）</label>
      <input ref={baseRef} placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1" />
      <label>AI API Key（可选）</label>
      <input ref={keyRef} type="password" placeholder="sk-..." />
      <label>AI 模型名（可选）</label>
      <input ref={modelRef} placeholder="qwen-vl-max" />
      <div className="ops">
        <button onClick={onClose}>取消</button>
        <button className="upload-btn" onClick={save}>
          保存
        </button>
      </div>
    </dialog>
  )
}
