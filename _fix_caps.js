// 把远端双重 UTF-8 编码的 captions.json 反向解码恢复
const fs = require('fs')
const { execSync } = require('child_process')

const enc = execSync('gh api repos/yes-we-coding/travel-album/contents/public/photos/captions.json --jq .content').toString()
const raw = Buffer.from(enc.replace(/\n/g, ''), 'base64').toString('utf8')

// 双重 UTF-8 → 原文字符
const once = Buffer.from(raw, 'latin1').toString('utf8')
const twice = Buffer.from(once, 'latin1').toString('utf8')

const j = JSON.parse(twice)
const keys = Object.keys(j)
console.log('条目数:', keys.length)
for (const k of keys) {
  console.log(`  ${k}: title="${j[k].title}" caption="${(j[k].caption || '').slice(0, 50)}"`)
}

fs.writeFileSync('public/photos/captions.json', JSON.stringify(j, null, 2) + '\n', 'utf8')
console.log('已写入 public/photos/captions.json')