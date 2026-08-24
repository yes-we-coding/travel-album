let db = null

export function openDB() {
  return new Promise((res, rej) => {
    const rq = indexedDB.open('travel-album', 1)
    rq.onupgradeneeded = () => rq.result.createObjectStore('photos', { keyPath: 'id' })
    rq.onsuccess = () => {
      db = rq.result
      res(db)
    }
    rq.onerror = () => rej(rq.error)
  })
}

export function idbAll() {
  return new Promise((res, rej) => {
    const tx = db.transaction('photos', 'readonly').objectStore('photos').getAll()
    tx.onsuccess = () => res(tx.result || [])
    tx.onerror = () => rej(tx.error)
  })
}

export function idbPut(rec) {
  return new Promise((res) => {
    const tx = db.transaction('photos', 'readwrite')
    tx.objectStore('photos').put(rec)
    tx.oncomplete = res
  })
}

export function idbDel(id) {
  return new Promise((res) => {
    const tx = db.transaction('photos', 'readwrite')
    tx.objectStore('photos').delete(id)
    tx.oncomplete = res
  })
}
