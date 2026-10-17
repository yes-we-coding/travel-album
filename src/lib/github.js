// GitHub API：浏览器端读写仓库（上传 / 删除照片）
// 写操作统一走 Git Data API（ref → tree → commit → 更新 ref），
// 一次调用 = 一个 commit，只触发一次 Actions 构建；并发冲突自动重试。
import { utf8ToBase64 } from './util.js'

const API = 'https://api.github.com/repos/yes-we-coding/travel-album'
const BRANCH = 'main'

function headers(token) {
  return { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' }
}

function enc(path) {
  return path.split('/').map(encodeURIComponent).join('/')
}

async function api(token, method, url, body) {
  const r = await fetch(API + url, {
    method,
    headers: body ? { ...headers(token), 'Content-Type': 'application/json' } : headers(token),
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (r.status === 404) return null
  if (!r.ok) {
    const t = await r.text()
    let why = ''
    try {
      why = JSON.parse(t).message || ''
    } catch {
      /* ignore */
    }
    const err = new Error('http ' + r.status + (why ? '：' + why : ''))
    err.status = r.status
    throw err
  }
  return r.json()
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

/** 校验 token 对仓库的写权限，返回错误信息或 null */
export async function checkToken(token) {
  const r = await fetch(API, { headers: headers(token) })
  if (r.status === 404 || r.status === 401) return 'token 无效或没有该仓库的访问权限'
  if (!r.ok) return 'http ' + r.status
  const j = await r.json()
  if (j.permissions && j.permissions.push === false) return 'token 对该仓库没有写权限（需要 Contents: Read and write）'
  return null
}

async function createBlob(token, base64) {
  const j = await api(token, 'POST', '/git/blobs', { content: base64, encoding: 'base64' })
  if (!j) throw new Error('创建 blob 失败')
  return j.sha
}

/**
 * 单提交事务，并发冲突（non-fast-forward）自动换最新 base 重试。
 * files:   { path: base64 }                       静态二进制文件（照片），blob 只创建一次
 * edits:   { path: (currentText|null) => newText|null }  基于每次重试时的最新远端内容计算（如合并 captions.json）
 *          返回 null 表示本轮跳过该文件
 * deletes: [path]                                 要从仓库删除的文件
 */
export async function commitFiles(token, { message, files = {}, edits = {}, deletes = [] }) {
  const staticBlobs = {}
  for (const [p, b64] of Object.entries(files)) staticBlobs[p] = await createBlob(token, b64)

  let lastErr = null
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const ref = await api(token, 'GET', '/git/ref/heads/' + BRANCH)
      if (!ref) throw new Error('找不到分支 ' + BRANCH)
      const baseCommit = ref.object.sha
      const commit = await api(token, 'GET', '/git/commits/' + baseCommit)
      const baseTree = commit.tree.sha

      const tree = []
      for (const [p, sha] of Object.entries(staticBlobs)) {
        tree.push({ path: p, mode: '100644', type: 'blob', sha })
      }
      for (const [p, fn] of Object.entries(edits)) {
        // getText 只在 404 时返回 null，其余错误直接抛出（避免把远端内容误判为空再覆盖）
        const cur = await getText(token, p)
        const next = fn(cur)
        if (next == null) continue
        const sha = await createBlob(token, utf8ToBase64(next))
        tree.push({ path: p, mode: '100644', type: 'blob', sha })
      }
      for (const p of deletes) tree.push({ path: p, mode: '100644', type: 'blob', sha: null })

      const newTree = await api(token, 'POST', '/git/trees', { base_tree: baseTree, tree })
      const newCommit = await api(token, 'POST', '/git/commits', {
        message,
        tree: newTree.sha,
        parents: [baseCommit],
      })
      await api(token, 'PATCH', '/git/refs/heads/' + BRANCH, { sha: newCommit.sha, force: false })
      return newCommit
    } catch (err) {
      lastErr = err
      // 422：有人抢先提交了（non-fast-forward）→ 基于最新 ref 重试整轮
      if (err.status === 422 && attempt < 4) continue
      throw err
    }
  }
  throw lastErr
}
