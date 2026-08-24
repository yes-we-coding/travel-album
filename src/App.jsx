import { useCallback, useEffect, useRef, useState } from 'react'
import { openDB, idbAll, idbPut, idbDel } from './lib/idb.js'
import { uid, readFileAsDataURL, readFileAsArrayBuffer } from './lib/util.js'
import { parseExif } from './lib/exif.js'
import { analyzeImage, heuristicCaption, defaultTitle } from './lib/analyze.js'
import { aiCaption, downscaledDataURL } from './lib/ai.js'
import { reverseGeo } from './lib/geo.js'
import { metaLine, exportStaticAlbum } from './lib/exportHtml.js'
import ManageCard from './components/ManageCard.jsx'
import BlogFigure from './components/BlogFigure.jsx'
import Lightbox from './components/Lightbox.jsx'
import SettingsDialog from './components/SettingsDialog.jsx'

export default function App() {
  const [photos, setPhotos] = useState([]) // {id, blob, url, title, caption, meta, created}
  const [viewMode, setViewMode] = useState('manage') // manage | blog
  const [toastMsg, setToastMsg] = useState('')
  const [lightboxPhoto, setLightboxPhoto] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef(null)
  const toastTimer = useRef(null)
  const ready = useRef(false)

  const toast = useCallback((msg) => {
    setToastMsg(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastMsg(''), 2600)
  }, [])

  /* ---------- 启动：打开 IndexedDB，载入照片 ---------- */
  useEffect(() => {
    let cancelled = false
    openDB()
      .then(idbAll)
      .then((recs) => {
        if (cancelled) return
        const loaded = recs.map((r) => ({ ...r, url: URL.createObjectURL(r.blob) }))
        setPhotos(loaded)
        ready.current = true
      })
      .catch((err) => toast('初始化失败：' + err.message))
    return () => {
      cancelled = true
    }
  }, [toast])

  /* ---------- 上传处理 ---------- */
  const processFile = useCallback(
    async (f) => {
      toast('处理中：' + f.name)
      let dataURL, buf
      try {
        ;[dataURL, buf] = await Promise.all([readFileAsDataURL(f), readFileAsArrayBuffer(f)])
      } catch {
        toast('读取失败：' + f.name)
        return
      }
      const img = await new Promise((res, rej) => {
        const i = new Image()
        i.onload = () => res(i)
        i.onerror = () => rej()
        i.src = dataURL
      }).catch(() => {
        toast('无法解码图片：' + f.name)
        return null
      })
      if (!img) return

      const ex = parseExif(buf) || {}
      const meta = { dt: ex.dt || null, gps: ex.gps || null, place: null, w: img.naturalWidth, h: img.naturalHeight }
      const an = analyzeImage(img)
      const p = { id: uid(), blob: f, url: URL.createObjectURL(f), title: '', caption: '', meta, created: Date.now() }
      setPhotos((prev) => [...prev, p])

      // 逆地理编码（失败静默）
      if (meta.gps) {
        const place = await reverseGeo(meta.gps.lat, meta.gps.lon)
        if (place) meta.place = place
      }
      // AI 描述 → 兜底文案
      const ai = await aiCaption(downscaledDataURL(img, 1024), toast)
      p.caption = ai || heuristicCaption(meta, an)
      p.title = defaultTitle(meta)
      await idbPut({ id: p.id, blob: p.blob, title: p.title, caption: p.caption, meta: p.meta, created: p.created })
      setPhotos((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...p } : x)))
      toast('已加入相册：' + p.title)
    },
    [toast],
  )

  const addFiles = useCallback(
    (files) => {
      Array.from(files).forEach((f) => {
        if (!/^image\//.test(f.type)) {
          toast('跳过非图片文件：' + f.name)
          return
        }
        processFile(f)
      })
    },
    [processFile, toast],
  )

  /* ---------- 全局拖拽 ---------- */
  useEffect(() => {
    const prevent = (e) => e.preventDefault()
    const drop = (e) => {
      e.preventDefault()
      setDragOver(false)
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) addFiles(e.dataTransfer.files)
    }
    document.addEventListener('dragover', prevent)
    document.addEventListener('drop', drop)
    return () => {
      document.removeEventListener('dragover', prevent)
      document.removeEventListener('drop', drop)
    }
  }, [addFiles])

  /* ---------- 编辑 / 删除 / 重新生成 ---------- */
  const patchAndSave = useCallback((id, patch) => {
    setPhotos((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, ...patch } : p))
      const p = next.find((x) => x.id === id)
      if (p) idbPut({ id: p.id, blob: p.blob, title: p.title, caption: p.caption, meta: p.meta, created: p.created })
      return next
    })
  }, [])

  const onDelete = useCallback((id) => {
    setPhotos((prev) => {
      const p = prev.find((x) => x.id === id)
      if (p) URL.revokeObjectURL(p.url)
      return prev.filter((x) => x.id !== id)
    })
    idbDel(id)
  }, [])

  const onRegenerated = useCallback(
    (id, text) => {
      patchAndSave(id, { caption: text })
      toast('描述已更新')
    },
    [patchAndSave, toast],
  )

  /* ---------- 导出静态相册 ---------- */
  const doExport = async () => {
    if (!photos.length) {
      toast('相册是空的，先上传照片')
      return
    }
    toast('导出中，照片多的话要等几秒…')
    const sorted = photos
      .slice()
      .sort((a, b) => (a.meta.dt || '').localeCompare(b.meta.dt || '') || a.created - b.created)
    const urls = await Promise.all(sorted.map((p) => readFileAsDataURL(p.blob)))
    exportStaticAlbum(sorted, urls)
    toast('已导出 我的旅行相册.html')
  }

  /* ---------- 排序 ---------- */
  const sortedPhotos = photos
    .slice()
    .sort(
      (a, b) =>
        (viewMode === 'manage' ? (b.meta.dt || '').localeCompare(a.meta.dt || '') : (a.meta.dt || '').localeCompare(b.meta.dt || '')) ||
        (viewMode === 'manage' ? b.created - a.created : a.created - b.created),
    )

  return (
    <>
      <header>
        <h1>
          行摄<span>集</span>
        </h1>
        <button onClick={() => setViewMode(viewMode === 'manage' ? 'blog' : 'manage')}>
          {viewMode === 'manage' ? '切换到浏览模式' : '切换到管理模式'}
        </button>
        <button onClick={doExport}>导出静态相册</button>
        <button onClick={() => setSettingsOpen(true)}>AI 描述设置</button>
        <label className="upload-btn" htmlFor="fileInput">
          上传照片
        </label>
        <input
          ref={fileInputRef}
          type="file"
          id="fileInput"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            addFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </header>
      <main>
        <div
          id="dropzone"
          className={(dragOver ? 'over ' : '') + (viewMode !== 'manage' ? 'hidden' : '')}
          onDragEnter={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={(e) => {
            e.preventDefault()
            setDragOver(false)
          }}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files)
          }}
        >
          把旅游照片拖到这里，或点右上角「上传照片」，支持多选。
          <br />
          上传后自动生成标题和文字描述（配置 AI key 后由视觉模型撰写，否则用 EXIF + 画面分析生成）。
        </div>

        {viewMode === 'manage' && (
          <section id="manageView">
            {sortedPhotos.length === 0 ? (
              <div className="empty" style={{ gridColumn: '1/-1' }}>
                相册还是空的，上传第一张旅行照片吧。
              </div>
            ) : (
              sortedPhotos.map((p) => (
                <ManageCard
                  key={p.id}
                  photo={p}
                  onTitleChange={(id, v) => patchAndSave(id, { title: v })}
                  onCaptionChange={(id, v) => patchAndSave(id, { caption: v })}
                  onDelete={onDelete}
                  onRegenerated={onRegenerated}
                  toast={toast}
                />
              ))
            )}
          </section>
        )}

        {viewMode === 'blog' && (
          <section id="blogView">
            {sortedPhotos.length === 0 ? (
              <div className="empty">相册还是空的。</div>
            ) : (
              sortedPhotos.map((p) => <BlogFigure key={p.id} photo={p} onOpen={setLightboxPhoto} />)
            )}
          </section>
        )}
      </main>

      <Lightbox photo={lightboxPhoto} onClose={() => setLightboxPhoto(null)} />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} toast={toast} />
      <div id="toast" className={toastMsg ? 'show' : ''}>
        {toastMsg}
      </div>
    </>
  )
}
