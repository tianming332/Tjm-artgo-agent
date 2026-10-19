// Read-only progress page served by the daemon: task state, workflow phases, steps, latest preview.
export function progressPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Art GO Agent · 进度</title>
<style>
  body { font: 14px/1.5 system-ui, -apple-system, "PingFang SC", sans-serif; margin: 0; background: #111; color: #e8e8e8; }
  main { display: grid; grid-template-columns: minmax(280px, 1fr) minmax(320px, 1.2fr); gap: 16px; padding: 16px; }
  section { background: #1b1b1b; border-radius: 8px; padding: 12px 14px; }
  h1 { font-size: 16px; margin: 0 0 8px; } h2 { font-size: 13px; margin: 12px 0 6px; color: #9aa; }
  .state { display: inline-block; padding: 1px 8px; border-radius: 10px; background: #333; }
  .phase { margin-right: 10px; } .phase.on { color: #6ee7b7; }
  ol { margin: 0; padding-left: 20px; max-height: 40vh; overflow: auto; }
  li.failed, li.rejected { color: #f87171; } li.done { color: #cbd5e1; } li.pending, li.leased { color: #fbbf24; }
  #events { max-height: 30vh; overflow: auto; font-size: 12px; color: #aaa; white-space: pre-wrap; }
  img { max-width: 100%; border-radius: 4px; background: repeating-conic-gradient(#2a2a2a 0 25%, #222 0 50%) 0 0 / 16px 16px; }
  @media (max-width: 760px) { main { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<main>
  <section>
    <h1>Art GO Agent <span id="state" class="state">—</span></h1>
    <div id="meta"></div>
    <h2>工作流</h2><div id="phases"></div>
    <h2>步骤</h2><ol id="steps"></ol>
    <h2>事件</h2><div id="events"></div>
  </section>
  <section><h1>最新预览</h1><img id="preview" alt="最新画布预览"></section>
</main>
<script>
  const token = new URLSearchParams(location.search).get('token');
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let lastPreview = '';
  async function tick() {
    try {
      const r = await fetch('/api/status?token=' + encodeURIComponent(token));
      const { data } = await r.json();
      const t = data.task;
      document.getElementById('state').textContent = t ? t.state : '无任务';
      document.getElementById('meta').innerHTML = esc('项目：' + (data.project ?? '—')) + '<br>' + (data.doc ? esc(data.doc.name + ' · ' + data.doc.width + '×' + data.doc.height + ' · 修订 ' + data.doc.revision) : '')
        + (t ? '<br>' + esc('需求：' + t.prompt.slice(0, 200)) + '<br>' + esc('Skill：' + (t.skill ?? '—') + ' · 轮次 ' + t.budget.modelCallsUsed + '/' + t.budget.modelCalls + ' · 生图 ' + t.budget.generationsUsed + '/' + t.budget.generations) : '')
        + (data.waitingForAgent ? '<br>等待外部 Agent 决策…' : '');
      document.getElementById('phases').innerHTML = t ? [['analyze', '分析需求'], ['assets', '检查素材'], ['skills', '匹配 Skill']].map(([k, v]) => '<span class="phase' + (t.phases[k] ? ' on' : '') + '">' + (t.phases[k] ? '✓ ' : '○ ') + v + '</span>').join('') : '';
      document.getElementById('steps').innerHTML = t ? t.steps.map((s) => '<li class="' + esc(s.status) + '">' + esc(s.tool + ' · ' + s.status + (s.error ? ' · ' + s.error : '')) + '</li>').join('') : '';
      const ev = document.getElementById('events');
      ev.textContent = (data.events || []).map((e) => new Date(e.at).toLocaleTimeString() + '  ' + e.message).join('\\n');
      ev.scrollTop = ev.scrollHeight;
      const key = data.doc ? data.doc.revision + ':' + (t ? t.steps.length : 0) : '';
      if (key !== lastPreview) { lastPreview = key; document.getElementById('preview').src = '/api/preview?token=' + encodeURIComponent(token) + '&k=' + encodeURIComponent(key); }
    } catch { /* daemon restarting */ }
    setTimeout(tick, 1500);
  }
  tick();
</script>
</body>
</html>`;
}
