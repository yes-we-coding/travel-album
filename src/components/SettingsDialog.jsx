import { useEffect, useRef } from 'react'
import { getCfg, saveCfg, clearCfg } from '../lib/ai.js'

export default function SettingsDialog({ open, onClose, toast }) {
  const dialogRef = useRef(null)
  const baseRef = useRef(null)
  const keyRef = useRef(null)
  const modelRef = useRef(null)

  useEffect(() => {
    const dlg = dialogRef.current
    if (!dlg) return
    if (open && !dlg.open) {
      const cfg = getCfg() || {}
      baseRef.current.value = cfg.base || ''
      keyRef.current.value = cfg.key || ''
      modelRef.current.value = cfg.model || ''
      dlg.showModal()
    } else if (!open && dlg.open) {
      dlg.close()
    }
  }, [open])

  const save = () => {
    saveCfg({
      base: baseRef.current.value.trim(),
      key: keyRef.current.value.trim(),
      model: modelRef.current.value.trim(),
    })
    onClose()
    toast('AI 设置已保存')
  }

  const clear = () => {
    clearCfg()
    baseRef.current.value = keyRef.current.value = modelRef.current.value = ''
    onClose()
    toast('已清空 AI 设置')
  }

  return (
    <dialog ref={dialogRef} onCancel={onClose}>
      <h2>AI 描述设置（可选）</h2>
      <p className="hint">
        填写兼容 OpenAI 协议的视觉模型接口后，上传照片会调用模型写一段旅行随笔式描述。
        不填则使用本地兜底方案（EXIF 时间/地点 + 画面色彩分析）。key 只保存在本机浏览器 localStorage。
      </p>
      <label>API Base URL</label>
      <input ref={baseRef} placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1" />
      <label>API Key</label>
      <input ref={keyRef} type="password" placeholder="sk-..." />
      <label>模型名</label>
      <input ref={modelRef} placeholder="qwen-vl-max" />
      <div className="ops">
        <button onClick={clear}>清空</button>
        <button className="upload-btn" style={{ color: '#20160a' }} onClick={save}>
          保存
        </button>
      </div>
    </dialog>
  )
}
