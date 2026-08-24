// GitHub Contents API：把文件直接提交进仓库（用于浏览器端上传照片）
const API = 'https://api.github.com/repos/yes-we-coding/travel-album'

function headers(token) {
  return { Authorization: '***' + token, Accept: 'application/vnd.github+json' }
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
  return atob(j.content.replace(/\n/g, ''))
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

/** 校验 token 对仓库的写权限，返回错误信息或 null */
export async function checkToken(token) {
  const r = await fetch(API, { headers: headers(token) })
  if (r.status === 404 || r.status === 401) return 'token 无效或没有该仓库的访问权限'
  if (!r.ok) return 'http ' + r.status
  const j = await r.json()
  if (j.permissions && j.permissions.push === false) return 'token 对该仓库没有写权限（需要 Contents: Read and write）'
  return null
}
