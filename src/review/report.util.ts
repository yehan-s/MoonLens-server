export function escapeHtml(s: string) {
  return s.replace(/[&<>\"]+/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c] || c)
}

function categorize(type?: string): string {
  const t = (type||'').toString().toLowerCase()
  if (!t) return 'maintainability'
  if (t.includes('sec') || t.includes('xss') || t.includes('sqli')) return 'security'
  if (t.includes('perf') || t.includes('latency')) return 'performance'
  if (t.includes('style') || t.includes('format')) return 'style'
  if (t.includes('best') || t.includes('practice')) return 'best-practice'
  return 'maintainability'
}

export function formatReport(raw: any) {
  const issues = (raw.issues || []).map((x: any) => ({
    file: x.filePath || x.file || 'unknown',
    line: x.lineNumber || x.line || undefined,
    severity: String(x.severity || 'INFO').toUpperCase(),
    type: x.type || undefined,
    category: categorize(x.type),
    message: x.message || '',
    suggestion: x.suggestion || '',
    rule: x.rule || undefined,
    confidence: x.confidence ?? undefined,
  }))
  const counts = issues.reduce((acc: any, it: any) => { acc[it.severity] = (acc[it.severity]||0)+1; return acc }, { CRITICAL:0, HIGH:0, MEDIUM:0, LOW:0, INFO:0 })
  const byCategory = issues.reduce((acc: any, it: any) => { acc[it.category] = (acc[it.category]||0)+1; return acc }, {} as Record<string, number>)
  const summary = {
    totalIssues: issues.length,
    critical: counts.CRITICAL,
    high: counts.HIGH,
    medium: counts.MEDIUM,
    low: counts.LOW,
    info: counts.INFO,
  }
  return { id: raw.id, projectId: raw.projectId, mrIid: raw.mrIid || raw.mergeRequestIid, createdAt: raw.createdAt, summary, counts, byCategory, issues }
}

export function renderHtml(report: any) {
  const esc = escapeHtml
  const head = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/>
    <title>审查报告 ${esc(report.id)}</title>
    <style>body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:16px;color:#222}
    h1{font-size:20px;margin:0 0 8px} .meta{color:#666;margin-bottom:12px}
    table{border-collapse:collapse;width:100%} th,td{border:1px solid #ddd;padding:6px 8px;font-size:12px}
    th{background:#f7f7f7;text-align:left} .sev-CRITICAL{color:#b00020;font-weight:600}
    .sev-HIGH{color:#d97706;font-weight:600} .sev-LOW{color:#0d9488} .sev-INFO{color:#2563eb}
    .grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:8px 0 12px}
    .card{background:#fafafa;border:1px solid #eee;border-radius:6px;padding:8px;text-align:center}
    .muted{color:#666}
    </style></head><body>`
  const top = `<h1>审查报告</h1>
    <div class=\"meta\">报告ID：${esc(report.id)} | 项目：${esc(String(report.projectId||''))} ${report.mrIid?`| MR #${report.mrIid}`:''} | 时间：${esc(String(report.createdAt||''))}</div>
    <div class=\"grid\">
      <div class=\"card\">问题总数<br><b>${report.summary.totalIssues}</b></div>
      <div class=\"card\">严重<br><b class=\"sev-CRITICAL\">${report.summary.critical}</b></div>
      <div class=\"card\">高<br><b class=\"sev-HIGH\">${report.summary.high}</b></div>
      <div class=\"card\">中<br><b>${report.summary.medium}</b></div>
      <div class=\"card\">低/提示<br><b>${report.summary.low + report.summary.info}</b></div>
    </div>`
  const rows = report.issues.map((it: any) => `<tr>
    <td class=\"sev-${it.severity}\">${esc(it.severity)}</td>
    <td>${esc(it.category)}</td>
    <td>${esc(it.type||'')}</td>
    <td>${esc(it.file)}${it.line?`:${it.line}`:''}</td>
    <td>${esc(it.message)}</td>
    <td>${esc(it.suggestion||'')}</td>
    <td>${esc(it.rule||'')}</td>
  </tr>`).join('')
  const table = `<table><thead><tr><th>严重度</th><th>类别</th><th>类型</th><th>位置</th><th>描述</th><th>建议</th><th>规则</th></tr></thead><tbody>${rows}</tbody></table>`
  const foot = `<div class=\"muted\" style=\"margin-top:8px\">本报告不包含源代码，敏感信息已脱敏。</div></body></html>`
  return head + top + table + foot
}

