import { useEffect, useState } from 'react'
import { metaLine } from './lib/util.js'
import BlogFigure from './components/BlogFigure.jsx'
import Lightbox from './components/Lightbox.jsx'

export default function App() {
  const [photos, setPhotos] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [lightbox, setLightbox] = useState(null)

  useEffect(() => {
    const base = import.meta.env.BASE_URL || '/'
    fetch(base + 'photos/manifest.json', { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error('http ' + r.status)
        return r.json()
      })
      .then((list) => {
        setPhotos(list || [])
        setLoaded(true)
      })
      .catch((err) => {
        setError('加载相册清单失败：' + err.message)
        setLoaded(true)
      })
  }, [])

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
      </header>
      <main>
        {!loaded ? (
          <div className="empty">加载中…</div>
        ) : error ? (
          <div className="empty">{error}</div>
        ) : count === 0 ? (
          <div className="empty">相册还是空的。把照片放进仓库的 public/photos/ 目录，跑一次 npm run build 就能看到它们了。</div>
        ) : (
          <section id="blogView">
            {photos.map((p) => (
              <BlogFigure key={p.id} photo={p} onOpen={setLightbox} />
            ))}
          </section>
        )}
      </main>
      <Lightbox photo={lightbox} onClose={() => setLightbox(null)} />
      <footer>行摄集 · 把路上的光留住</footer>
    </>
  )
}
