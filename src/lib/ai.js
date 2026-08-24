const CFG_KEY = '***'

export function getCfg() {
  try {
    return JSON.parse(localStorage.getItem(CFG_KEY) || 'null')
  } catch {
    return null
  }
}

export function saveCfg(cfg) {
  localStorage.setItem(CFG_KEY, JSON.stringify(cfg))
}

export function clearCfg() {
  localStorage.removeItem(CFG_KEY)
}

/** 调用兼容 OpenAI 协议的视觉模型写描述；失败返回 null */
export async function aiCaption(dataURL, onWarn) {
  const cfg = getCfg()
  if (!cfg || !cfg.key) return null
  const base = (cfg.base || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/+$/, '')
  const body = {
    model: cfg.model || 'qwen-vl-max',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: dataURL } },
          {
            type: 'text',
            text: '这是一张旅行照片。请用中文写一段 80 字左右的旅行手记风格描述：直接描写画面与当下的心境，不要列点，不要以“这张照片”开头，不要编造具体地名。',
          },
        ],
      },
    ],
    max_tokens: 300,
  }
  try {
    const r = await fetch(base + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: '***' + cfg.key },
      body: JSON.stringify(body),
    })
    if (!r.ok) throw new Error('http ' + r.status)
    const j = await r.json()
    const t = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content
    return (t || '').trim() || null
  } catch (err) {
    if (onWarn) onWarn('AI 描述调用失败，已用本地方案：' + err.message)
    return null
  }
}

/** 给 AI 的缩小版 dataURL，省流量 */
export function downscaledDataURL(img, max = 1024) {
  const w = img.naturalWidth
  const h = img.naturalHeight
  const s = Math.min(1, max / Math.max(w, h))
  const c = document.createElement('canvas')
  c.width = Math.round(w * s)
  c.height = Math.round(h * s)
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.85)
}
