// GitHub Contents API：把文件直接提交进仓库（用于浏览器端上传照片）
const API = 'https://api.github.com/repos/yes-we-coding/travel-album'

function headers(token) {
  return { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' }
}

function enc(path) {
  return path.split('/').map(encodeURIComponent).join('/')
}

/** 读取仓库里的文本文件，不存在返回 null */
export async function getText(token, path) {
  const r = await fetch(API + '/contents/' + enc(path), { headers: headers(token) })
  if (r.status === 404) return null
  if (!r.ok) throw new Error('读取失败 http ' + r.status)
  const j = await r.json()
  // atob 返回的是 Latin-1 字符串（每字符 0-255），实际内容是 UTF-8 字节，
  // 必须经 TextDecoder 转码，否则会被当作 Latin-1 字符再二次 UTF-8 编码（乱码）。
  const bin = atob(j.content.replace(/\n/g, ''))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder('utf-8').decode(bytes)
}

/** 读取仓库里的文件元信息（含 sha），不存在返回 null */
export async function getMeta(token, path) {
  const r = await fetch(API + '/contents/' + enc(path), { headers: headers(token) })
  if (r.status === 404) return null
  if (!r.ok) throw new Error('读取失败 http ' + r.status)
  const j = await r.json()
  return { sha: j.sha, size: j.size, name: j.name, path: j.path }
}

/** 创建或覆盖文件并提交 */
export async function putFile(token, path, base64, message) {
  // 文件已存在时 Contents API 要求带 sha
  let sha = null
  const cur = await fetch(API + '/contents/' + enc(path), { headers: headers(token) })
  if (cur.ok) sha = (await cur.json()).sha
  const r = await fetch(API + '/contents/' + enc(path), {
    method: 'PUT',
    headers: headers(token),
    body: JSON.stringify({ message, content: base64, ...(sha ? { sha } : {}) }),
  })
  if (!r.ok) {
    const t = await r.text()
    let why = ''
    try {
      why = JSON.parse(t).message || ''
    } catch {
      /* ignore */
    }
    throw new Error('提交失败 http ' + r.status + (why ? '：' + why : ''))
  }
  return r.json()
}

/** 删除仓库里的文件（必须带 sha） */
export async function deleteFile(token, path, sha, message) {
  if (!sha) throw new Error('删除文件需要 sha')
  const r = await fetch(API + '/contents/' + enc(path), {
    method: 'DELETE',
    headers: headers(token),
    body: JSON.stringify({ message, sha }),
  })
  if (!r.ok) {
    const t = await r.text()
    let why = ''
    try {
      why = JSON.parse(t).message || ''
    } catch {
      /* ignore */
    }
    throw new Error('删除失败 http ' + r.status + (why ? '：' + why : ''))
  }
  return r.json()
}

/** 校验 token 对仓库的写权限，返回错误信息或 null */
export async function checkToken(token) {
  const r = await fetch(API, { headers: headers(token) })
  if (r.status === 404 || r.status === 401) return 'token 无效或没有该仓库的访问权限'
  if (!r.ok) return 'http ' + r.status
  const j = await r.json()
  if (j.permissions && j.permissions.push === false) return 'token 对该仓库没有写权限（需要 Contents: Read and write）'
  return null
}
