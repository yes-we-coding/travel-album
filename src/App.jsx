import { useCallback, useEffect, useRef, useState } from 'react'
import BlogFigure from './components/BlogFigure.jsx'
import Lightbox from './components/Lightbox.jsx'
import SettingsDialog from './components/SettingsDialog.jsx'
import { parseExif } from './lib/exif.js'
import { analyzeImage, heuristicCaption, defaultTitle } from './lib/analyze.js'
import { aiCaption, downscaledDataURL, getCfg } from './lib/ai.js'
import { reverseGeo } from './lib/geo.js'
import { checkToken, getText, putFile } from './lib/github.js'
const ACCEPT = /\.(jpe?g|png|webp)$/i

function readFile(f, mode) {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result)
    r.onerror = () => rej(r.error)
    if (mode === 'buf') r.readAsArrayBuffer(f)
    else r.readAsDataURL(f)
  })
}

function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image()
    img.onload = () => res(img)
    img.onerror = rej
    img.src = src
  })
}

function sanitizeName(name) {
  const stem = name.replace(/\.[^.]+$/, '')
  let clean = stem.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  if (!clean) clean = 'photo-' + Date.now().toString(36)
  const ext = (name.match(/\.([a-z]+)$/i)?.[1] || 'jpg').toLowerCase()
  return clean + '.' + ext
}

export default function App() {
  const [photos, setPhotos] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [lightbox, setLightbox] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [toastMsg, setToastMsg] = useState('')
  const toastTimer = useRef(null)
  const fileInputRef = useRef(null)
  const manifestFetchedAt = useRef(0)

  const toast = useCallback((msg) => {
    setToastMsg(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastMsg(''), 4000)
  }, [])

  /* ---------- 载入清单 ---------- */
  const fetchManifest = useCallback(async () => {
    const base = import.meta.env.BASE_URL || '/'
    const r = await fetch(base + 'photos/manifest.json', { cache: 'no-cache' })
    if (!r.ok) throw new Error('http ' + r.status)
    return r.json()
  }, [])

  const loadManifest = useCallback(async () => {
    try {
      setPhotos(await fetchManifest())
      manifestFetchedAt.current = Date.now()
      setError('')
    } catch (err) {
      setError('加载相册清单失败：' + err.message)
    } finally {
      setLoaded(true)
    }
  }, [fetchManifest])

  useEffect(() => {
    // 初始加载：异步获取，不在 effect 里同步 setState
    let cancelled = false
    fetchManifest()
      .then((list) => {
        if (!cancelled) {
          setPhotos(list)
          manifestFetchedAt.current = Date.now()
        }
      })
      .catch((err) => {
        if (!cancelled) setError('加载相册清单失败：' + err.message)
      })
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [fetchManifest])

  /* ---------- 上传：浏览器直接提交进仓库 ---------- */
  const uploadFiles = useCallback(
    async (fileList) => {
      const files = Array.from(fileList).filter((f) => ACCEPT.test(f.name))
      if (!files.length) {
        toast('没有支持的图片文件（.jpg/.png/.webp）')
        return
      }
      const cfg = getCfg()
      if (!cfg.ghToken) {
        toast('请先在「设置」里填写 GitHub token')
        setSettingsOpen(true)
        return
      }
      setBusy(true)
      try {
        const tokErr = await checkToken(cfg.ghToken)
        if (tokErr) throw new Error(tokErr)

        const captions = (await getText(cfg.ghToken, 'public/photos/captions.json').then((t) => JSON.parse(t || '{}'))) || {}

        for (let i = 0; i < files.length; i++) {
          const f = files[i]
          toast(`处理中 ${i + 1}/${files.length}：${f.name}`)
          const [buf, dataURL] = await Promise.all([readFile(f, 'buf'), readFile(f)])
          const img = await loadImage(dataURL)
          const ex = parseExif(buf) || {}
          const meta = { dt: ex.dt || null, gps: ex.gps || null, place: null }
          if (meta.gps) meta.place = await reverseGeo(meta.gps.lat, meta.gps.lon)
          const ai = await aiCaption(downscaledDataURL(img, 1024), toast)
          const caption = ai || heuristicCaption(meta, analyzeImage(img))
          const title = defaultTitle(meta, f.name)
          const name = sanitizeName(f.name)

          // 提交源图
          const b64 = dataURL.slice(dataURL.indexOf(',') + 1)
          await putFile(cfg.ghToken, `public/photos/${name}`, b64, `相册：添加 ${name}`)

          captions[name] = { title, caption, ...(meta.place ? { place: meta.place } : {}) }
        }

        // 合并提交一次 captions
        // 正确 UTF-8 → base64：用 TextEncoder 把字符串编为 UTF-8 字节，再 btoa
        const capBytes = new TextEncoder().encode(JSON.stringify(captions, null, 2))
        let capBin = ''
        for (let i = 0; i < capBytes.length; i++) capBin += String.fromCharCode(capBytes[i])
        await putFile(
          cfg.ghToken,
          'public/photos/captions.json',
          btoa(capBin),
          '相册：更新描述文案',
        )
        toast(`已提交 ${files.length} 张照片，网站约 1-2 分钟后自动更新`)
        setTimeout(loadManifest, 90 * 1000)
      } catch (err) {
        toast('上传失败：' + err.message)
      } finally {
        setBusy(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    },
    [toast, loadManifest],
  )

  /* ---------- 全局拖拽 ---------- */
  useEffect(() => {
    const prevent = (e) => e.preventDefault()
    const drop = (e) => {
      e.preventDefault()
      setDragOver(false)
      if (e.dataTransfer?.files?.length) uploadFiles(e.dataTransfer.files)
    }
    document.addEventListener('dragover', prevent)
    document.addEventListener('drop', drop)
    return () => {
      document.removeEventListener('dragover', prevent)
      document.removeEventListener('drop', drop)
    }
  }, [uploadFiles])

  /* ---------- 灯箱键盘 ---------- */
  useEffect(() => {
    if (!lightbox) return
    const onKey = (e) => {
      if (e.key === 'Escape') setLightbox(null)
      const idx = photos.findIndex((p) => p.id === lightbox.id)
      if (e.key === 'ArrowRight' && idx < photos.length - 1) setLightbox(photos[idx + 1])
      if (e.key === 'ArrowLeft' && idx > 0) setLightbox(photos[idx - 1])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox, photos])

  const count = photos.length

  return (
    <>
      <header>
        <h1>
          行摄<span>集</span>
        </h1>
        {count > 0 && <span className="count">共 {count} 张照片</span>}
        <span style={{ marginLeft: 'auto' }} />
        <button onClick={() => setSettingsOpen(true)}>设置</button>
        <button className="upload-btn" onClick={() => fileInputRef.current?.click()} disabled={busy}>
          {busy ? '上传中…' : '上传照片'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={(e) => uploadFiles(e.target.files)}
        />
      </header>
      <main>
        <div
          id="dropzone"
          className={dragOver ? 'over' : ''}
          onDragEnter={(e) => {
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
            if (e.dataTransfer?.files?.length) uploadFiles(e.dataTransfer.files)
          }}
        >
          拖照片到这里，或点右上角「上传照片」。照片会直接提交到仓库并自动重新部署，任何浏览器打开都能看到。
        </div>
        {!loaded ? (
          <div className="empty">加载中…</div>
        ) : error ? (
          <div className="empty">{error}</div>
        ) : count === 0 ? (
          <div className="empty">相册还是空的，上传第一张旅行照片吧。</div>
        ) : (
          <section id="blogView">
            {photos.map((p) => (
              <BlogFigure key={p.id} photo={p} onOpen={setLightbox} />
            ))}
          </section>
        )}
      </main>
      <Lightbox photo={lightbox} onClose={() => setLightbox(null)} />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} toast={toast} />
      <footer>行摄集 · 把路上的光留住</footer>
      <div id="toast" className={toastMsg ? 'show' : ''}>
        {toastMsg}
      </div>
    </>
  )
}
