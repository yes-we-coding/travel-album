import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import BlogFigure from './components/BlogFigure.jsx'
import Lightbox from './components/Lightbox.jsx'
import SettingsDialog from './components/SettingsDialog.jsx'
import { parseExif } from './lib/exif.js'
import { analyzeImage, heuristicCaption, defaultTitle } from './lib/analyze.js'
import { aiCaption, downscaledDataURL, getCfg } from './lib/ai.js'
import { reverseGeo } from './lib/geo.js'
import { checkToken, getText, commitFiles } from './lib/github.js'
import { sleep } from './lib/util.js'
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

/** 重名避让：name.jpg → name-2.jpg → name-3.jpg …… */
function uniquify(name, taken) {
  const m = name.match(/^(.*?)(\.[^.]+)$/)
  let i = 2
  let cand = `${m[1]}-${i}${m[2]}`
  while (taken.has(cand)) cand = `${m[1]}-${++i}${m[2]}`
  return cand
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

  /* ---------- 灯箱开关：同步 #photo=id 直链 ---------- */
  const openLightbox = useCallback((p) => {
    setLightbox(p)
    history.replaceState(null, '', '#photo=' + encodeURIComponent(p.id))
  }, [])

  const closeLightbox = useCallback(() => {
    setLightbox(null)
    if (location.hash.startsWith('#photo=')) {
      history.replaceState(null, '', location.pathname + location.search)
    }
  }, [])

  /* 上传 / 删除后轮询 manifest，直到远端构建完成（最长 ~5 分钟） */
  const pollForUpdate = useCallback(
    (prevKey) => {
      ;(async () => {
        for (let i = 0; i < 20; i++) {
          await sleep(15000)
          try {
            const list = await fetchManifest()
            if (list.map((p) => p.id).join('|') !== prevKey) {
              setPhotos(list)
              toast('相册已更新 ✓')
              return
            }
          } catch {
            /* 构建期间 manifest 可能短暂不可用，继续等 */
          }
        }
        toast('部署时间较长，稍后可手动刷新查看')
      })()
    },
    [fetchManifest, toast],
  )

  useEffect(() => {
    // 初始加载：异步获取，不在 effect 里同步 setState
    let cancelled = false
    fetchManifest()
      .then((list) => {
        if (!cancelled) setPhotos(list)
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

        // 已占用的文件名（避让重名，防止静默覆盖旧照片）
        const remoteCaps = JSON.parse((await getText(cfg.ghToken, 'public/photos/captions.json')) || '{}')
        const taken = new Set([...photos.map((p) => p.src), ...Object.keys(remoteCaps)])

        const blobs = {} // path -> base64
        const newCaps = {} // name -> 描述条目
        let renamed = 0
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

          let name = sanitizeName(f.name)
          if (taken.has(name)) {
            name = uniquify(name, taken)
            renamed++
          }
          taken.add(name)

          blobs[`public/photos/${name}`] = dataURL.slice(dataURL.indexOf(',') + 1)
          newCaps[name] = { title, caption, ...(meta.place ? { place: meta.place } : {}) }
        }

        // 单 commit 提交全部照片 + 合并 captions（只触发一次 Actions 构建，冲突自动重试）
        toast('提交到仓库…')
        const prevKey = photos.map((p) => p.id).join('|')
        await commitFiles(cfg.ghToken, {
          message: `相册：添加 ${files.length} 张照片`,
          files: blobs,
          edits: {
            'public/photos/captions.json': (cur) =>
              JSON.stringify({ ...JSON.parse(cur || '{}'), ...newCaps }, null, 2),
          },
        })
        toast(
          `已提交 ${files.length} 张照片` +
            (renamed ? `（${renamed} 个重名已自动改名）` : '') +
            '，等待自动部署…',
        )
        pollForUpdate(prevKey)
      } catch (err) {
        toast('上传失败：' + err.message)
      } finally {
        setBusy(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    },
    [toast, photos, pollForUpdate],
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

  /* ---------- 直链打开：#photo=id ---------- */
  const deepLinked = useRef(false)
  useEffect(() => {
    if (!loaded || deepLinked.current) return
    deepLinked.current = true
    const m = location.hash.match(/^#photo=(.+)$/)
    if (m) {
      const p = photos.find((x) => x.id === decodeURIComponent(m[1]))
      if (p) openLightbox(p)
    }
  }, [loaded, photos, openLightbox])

  /* ---------- 灯箱键盘 ---------- */
  useEffect(() => {
    if (!lightbox) return
    const onKey = (e) => {
      if (e.key === 'Escape') closeLightbox()
      const idx = photos.findIndex((p) => p.id === lightbox.id)
      if (e.key === 'ArrowRight' && idx < photos.length - 1) openLightbox(photos[idx + 1])
      if (e.key === 'ArrowLeft' && idx > 0) openLightbox(photos[idx - 1])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox, photos, openLightbox, closeLightbox])

  const count = photos.length

  /* 时间线分节：按年月分组（manifest 已按时间升序） */
  const groups = []
  for (const p of photos) {
    const label = p.dt ? `${p.dt.slice(0, 4)}年${Number(p.dt.slice(5, 7))}月` : '未标注时间'
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.items.push(p)
    else groups.push({ label, items: [p] })
  }

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
            {groups.map((g) => (
              <Fragment key={g.label}>
                <div className="tl-header">{g.label}</div>
                {g.items.map((p) => (
                  <BlogFigure key={p.id} photo={p} onOpen={openLightbox} />
                ))}
              </Fragment>
            ))}
          </section>
        )}
      </main>
      <Lightbox
        photo={lightbox}
        onClose={closeLightbox}
        onDeleted={(id) => {
          const prevKey = photos.map((p) => p.id).join('|')
          setPhotos((ps) => ps.filter((p) => p.id !== id))
          toast('已删除，等待自动部署同步…')
          pollForUpdate(prevKey)
        }}
      />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} toast={toast} />
      <footer>行摄集 · 把路上的光留住</footer>
      <div id="toast" className={toastMsg ? 'show' : ''}>
        {toastMsg}
      </div>
    </>
  )
}
