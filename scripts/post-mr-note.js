#!/usr/bin/env node
// 目的：用后端 .env 中的 GITLAB_BASE_URL 与 GITLAB_ACCESS_TOKEN 直接对指定项目与 MR 发表评论，验证连通性。
// 用法：node scripts/post-mr-note.js <projectPathOrId> <mrIid> [message]
// 例子：node scripts/post-mr-note.js sunyur_fe_op/fe-ext 12 "[MoonLens] 连通性验证 ✅"

const { URLSearchParams } = require('url')
try { require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') }) } catch {}

async function main() {
  const base = process.env.GITLAB_BASE_URL || 'http://gitlab.sunyur.com'
  const token = process.env.GITLAB_ACCESS_TOKEN
  const args = process.argv.slice(2)
  const project = args[0]
  const mrIid = args[1]
  const msg = args[2] || '[MoonLens] 连通性验证 ✅'

  if (!token) {
    console.error('缺少环境变量 GITLAB_ACCESS_TOKEN')
    process.exit(1)
  }
  if (!project || !mrIid) {
    console.error('用法：node scripts/post-mr-note.js <projectPathOrId> <mrIid> [message]')
    process.exit(1)
  }

  // 如果是路径，需要 URL 编码中的斜杠
  const projectEncoded = encodeURIComponent(project)
  const noteUrl = `${base.replace(/\/$/, '')}/api/v4/projects/${projectEncoded}/merge_requests/${encodeURIComponent(mrIid)}/notes`
  const res = await fetch(noteUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'PRIVATE-TOKEN': token },
    body: JSON.stringify({ body: msg })
  })
  if (!res.ok) {
    const text = await res.text()
    console.error('发表评论失败：', res.status, res.statusText, text)
    process.exit(1)
  }
  const json = await res.json()
  console.log('已发表测试评论：', json?.id, json?.body)
}

main().catch(err => { console.error(err); process.exit(1) })
