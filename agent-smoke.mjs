// Agent edition smoke: drives the real artgo CLI end to end (background Chrome, simulated image
// generation) in a throwaway state / projects directory. Run: npm run smoke:agent
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'artgo-smoke-'));
const env = { ...process.env, ARTGO_STATE_DIR: path.join(tmp, 'state'), ARTGO_PROJECTS_DIR: path.join(tmp, 'projects') };
const artgo = (args, input) => {
  let stdout;
  try { stdout = execFileSync(process.execPath, ['bin/artgo.mjs', ...args], { env, input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); }
  catch (e) { stdout = e.stdout; }
  return JSON.parse(stdout);
};
const call = (calls) => artgo(['call', '-f', '-'], JSON.stringify(calls));
const results = (r) => Object.fromEntries((r.turn?.input ?? []).filter((i) => i.type === 'result').map((i) => [i.tool, i]));
const r = {};

try {
  r.up = artgo(['up', '--mock', '--port', '5390']);
  r.skillSynced = r.up.skills?.find((s) => s.slug === 'style-swiss-minimal')?.status;
  r.noToken = await fetch(`http://127.0.0.1:${r.up.running ? 5390 : 0}/api/status`).then((x) => x.status).catch(() => 0);
  r.tools = artgo(['tools']).tools.length;

  const made = artgo(['new', 'smoke', '--size', '1080x1350']);
  r.doc = made.doc && `${made.doc.width}x${made.doc.height}`;

  const s = artgo(['start', '做一张海报，标题「春季新品」，副标题「全场八折」']);
  r.startHasRules = !!s.turn?.rules && s.turn.input.length > 0;

  // Workflow gate: an edit before analysis / assets / skills is rejected by the service.
  const gated = results(call([{ name: 'text_create', args: { text: 'x', x: 10, y: 10 } }]));
  r.gate = gated.text_create?.error?.code;

  const w = results(call([
    { name: 'report_analysis', args: { goal: '春季新品海报', deliverable: '1080x1350 竖版海报' } },
    { name: 'assets_list', args: {} },
    { name: 'doc_read', args: {} },
    { name: 'skill_list', args: { query: '海报' } },
  ]));
  r.phases = ['report_analysis', 'assets_list', 'doc_read', 'skill_list'].every((t) => w[t]?.ok);

  const sk = results(call([{ name: 'skill_load', args: { slug: 'generate-background' } }]));
  r.skill = sk.skill_load?.value?.slug;
  // Skill whitelist: generate-background does not allow region_select.
  const denied = results(call([{ name: 'region_select', args: { method: 'all' } }]));
  r.whitelist = denied.region_select?.error?.code;

  const gen = results(call([{ name: 'image_generate', args: { prompt: '春天花园背景，上方留白', aspectRatio: '3:4', role: 'background' } }]));
  const assetId = gen.image_generate?.value?.assetIds?.[0];
  r.generated = !!assetId;

  const ed = call([
    { name: 'asset_import', args: { assetId, role: 'background', fit: 'cover' } },
    { name: 'text_create', args: { text: '春季新品', x: 540, y: 300, size: 120, color: '#FFFFFF', align: 'center' } },
    { name: 'doc_read', args: {} },
    { name: 'doc_preview', args: {} },
  ]);
  const edr = results(ed);
  r.imported = edr.asset_import?.value?.coveredCanvas === true;
  // Layers created after the background import stack above it (top layer first in doc_read).
  const order = edr.doc_read?.value?.layers?.map((l) => l.id) ?? [];
  r.textAboveBackground = order.indexOf(edr.text_create?.value?.layers?.[0]) < order.indexOf(edr.asset_import?.value?.layer);
  const img = ed.turn.input.find((i) => i.type === 'image');
  r.previewFile = !!img && fs.existsSync(img.path) && fs.statSync(img.path).size > 1000;

  // Edit after the last preview, then finish: the service adds the final full-canvas review.
  call([{ name: 'doc_read', args: {} }]);
  call([{ name: 'text_create', args: { text: '全场八折', x: 540, y: 450, size: 60, color: '#FFFFFF', align: 'center' } }]);
  const f1 = artgo(['finish', '完成']);
  r.reviewForced = (f1.turn?.input ?? []).some((i) => i.type === 'image');
  const f2 = artgo(['finish', '已检查最终预览：背景铺满，标题与副标题清晰']);
  r.completed = f2.state;
  r.saved = (f2.saved ?? []).every((p) => fs.existsSync(p)) && (f2.saved ?? []).length === 2;

  const ex = artgo(['export', 'psd']);
  r.exportPsd = ex.bytes > 1000;
  const cp = JSON.parse(fs.readFileSync(path.join(tmp, 'projects', 'smoke', 'checkpoint.json'), 'utf8'));
  r.checkpoint = cp.task?.state;
  r.events = fs.readFileSync(path.join(tmp, 'projects', 'smoke', 'events.jsonl'), 'utf8').trim().split('\n').length;

  // Second task (no skill loaded): confirmation gate, pause / resume, cancel.
  artgo(['start', '删掉副标题']);
  const w2 = results(call([{ name: 'report_analysis', args: { goal: '删除副标题' } }, { name: 'assets_list', args: {} }, { name: 'skill_list', args: {} }, { name: 'doc_read', args: {} }]));
  const sub = w2.doc_read?.value?.layers?.find((l) => l.text === '全场八折')?.id;
  // Confirmation gate: layer_delete waits for the user; rejecting returns FORBIDDEN to the agent.
  const del = call([{ name: 'layer_delete', args: { layer: sub } }]);
  r.confirmState = del.state;
  const rej = artgo(['confirm', 'no']);
  r.rejected = results(rej).layer_delete?.error?.code;

  // Pause closes the open turn; resume opens a new one.
  r.paused = artgo(['pause']).state;
  const resumed = artgo(['resume']);
  r.resumed = resumed.state === 'waiting_model' && !!resumed.turn;

  r.cancelled = artgo(['cancel']).state;
  r.pageErrors = artgo(['health']).pageErrors;
} finally {
  artgo(['down']);
  await new Promise((res) => setTimeout(res, 1500));
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(JSON.stringify(r, null, 2));
const ok = r.up.running && r.skillSynced === 'created' && r.noToken === 401 && r.tools > 20 && r.doc === '1080x1350' && r.startHasRules
  && r.gate === 'BAD_STATE' && r.phases && r.skill === 'generate-background' && r.whitelist === 'FORBIDDEN' && r.generated && r.imported && r.textAboveBackground && r.previewFile
  && r.confirmState === 'waiting_confirmation' && r.rejected === 'FORBIDDEN' && r.paused === 'paused' && r.resumed
  && r.reviewForced && r.completed === 'completed' && r.saved && r.exportPsd && r.checkpoint === 'completed' && r.events > 10
  && r.cancelled === 'cancelled' && !r.pageErrors?.length;
console.log(ok ? 'AGENT SMOKE OK' : 'AGENT SMOKE FAILED');
process.exit(ok ? 0 : 1);
