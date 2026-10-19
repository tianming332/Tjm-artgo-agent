// artgo daemon: serves the editor (Vite), drives it in a background Chrome (Playwright) and exposes a
// small token-protected JSON-RPC on 127.0.0.1 for the artgo CLI. Project files land in projects/.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createServer as createVite } from 'vite';
import { chromium } from 'playwright';
import { loadSkills } from './skills.mjs';
import { progressPage } from './progress.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE_DIR = process.env.ARTGO_STATE_DIR ? path.resolve(process.env.ARTGO_STATE_DIR) : path.join(ROOT, '.artgo');
const RUNTIME = path.join(STATE_DIR, 'runtime.json');
const PROJECTS = process.env.ARTGO_PROJECTS_DIR ? path.resolve(process.env.ARTGO_PROJECTS_DIR) : path.join(ROOT, 'projects');
const PROJECT_NAME = /^[A-Za-z0-9\u4e00-\u9fff][A-Za-z0-9\u4e00-\u9fff_.-]{0,63}$/;
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };

export async function startDaemon({ headed = false, mock = false, port = 5290 } = {}) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.mkdirSync(PROJECTS, { recursive: true });
  const token = randomBytes(18).toString('hex');

  const vite = await createVite({ root: ROOT, server: { port: 5291, strictPort: false, host: '127.0.0.1', hmr: false, watch: null }, logLevel: 'error' });
  await vite.listen();
  const editorUrl = vite.resolvedUrls.local[0];

  // A persistent profile keeps keys, the asset library and skills across restarts.
  const context = await chromium.launchPersistentContext(path.join(STATE_DIR, 'chrome'), { channel: 'chrome', headless: !headed, viewport: { width: 1440, height: 900 } });
  const page = context.pages()[0] ?? await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 300)));
  await page.addInitScript('window.__name = (f) => f');
  await page.goto(`${editorUrl}?agent=1${mock ? '&mock=1' : ''}`);
  await page.waitForFunction(() => window.__tjmHost?.ready, null, { timeout: 120_000 });
  await host('attach');
  const skillSync = await host('syncSkills', { skills: loadSkills(path.join(ROOT, 'skills')) });

  let project = null; // { name, dir }
  let lastSeq = 0;

  async function host(method, params) {
    return page.evaluate(async ([m, p]) => window.__tjmHost[m](p), [method, params ?? {}]);
  }

  function useProject(name, create) {
    if (!PROJECT_NAME.test(String(name || ''))) throw rpcError('BAD_REQUEST', '项目名只能用字母、数字、中文、_ . -（最长 64）');
    const dir = path.join(PROJECTS, name);
    if (!create && !fs.existsSync(dir)) throw rpcError('NOT_FOUND', `项目 ${name} 不存在`);
    for (const d of ['assets', 'previews', 'exports']) fs.mkdirSync(path.join(dir, d), { recursive: true });
    project = { name, dir };
    lastSeq = 0;
    return project;
  }
  const need = () => { if (!project) throw rpcError('BAD_STATE', '先 artgo new <项目> 或 artgo open <项目>'); return project; };

  /** Paths given by the CLI are resolved against its working directory. */
  const readFile = (file, cwd) => {
    const abs = path.resolve(cwd || ROOT, String(file));
    if (!fs.statSync(abs).isFile()) throw rpcError('BAD_REQUEST', `不是文件：${abs}`);
    return { abs, name: path.basename(abs), base64: fs.readFileSync(abs).toString('base64') };
  };

  /** Images in a turn become files under previews/; events and the task snapshot are checkpointed. */
  async function record(result) {
    const p = project;
    if (p && result?.turn?.input) {
      let rev = result.task?.revision ?? 0, n = 0;
      result.turn.input = result.turn.input.map((item) => {
        if (item.type === 'result' && item.preview?.revision != null) rev = item.preview.revision;
        if (item.type !== 'image') return item;
        const file = path.join(p.dir, 'previews', `rev-${rev}${n++ ? `-${n}` : ''}.png`);
        fs.writeFileSync(file, Buffer.from(item.data, 'base64'));
        return { type: 'image', path: file, revision: rev };
      });
    }
    if (p) {
      const st = await host('status', { after: lastSeq });
      if (st.events?.length) {
        fs.appendFileSync(path.join(p.dir, 'events.jsonl'), st.events.map((e) => JSON.stringify(e)).join('\n') + '\n');
        lastSeq = st.events.at(-1).seq;
      }
      fs.writeFileSync(path.join(p.dir, 'checkpoint.json'), JSON.stringify({ project: p.name, savedAt: new Date().toISOString(), doc: st.doc, task: st.task }, null, 2));
      // A finished task leaves an editable PSD and a PNG next to the checkpoint.
      if (result?.state === 'completed' && st.doc) {
        for (const format of ['psd', 'png']) {
          const out = await host('exportDoc', { format });
          fs.writeFileSync(path.join(p.dir, format === 'psd' ? 'document.psd' : path.join('exports', 'final.png')), Buffer.from(out.base64, 'base64'));
        }
        result.saved = [path.join(p.dir, 'document.psd'), path.join(p.dir, 'exports', 'final.png')];
      }
    }
    return result;
  }

  const methods = {
    async health() { return { ok: true, editorUrl, headed, mock, project: project?.name ?? null, pageErrors: pageErrors.slice(-5), skills: skillSync }; },

    async new(a) {
      const p = useProject(a.project, true);
      let doc;
      if (a.image) {
        const f = readFile(a.image, a.cwd);
        fs.copyFileSync(f.abs, path.join(p.dir, 'assets', f.name));
        doc = await host('openImage', { name: f.name, base64: f.base64 });
      } else {
        const [w, h] = String(a.size || '1080x1350').split('x').map(Number);
        if (!(w >= 16 && h >= 16 && w <= 16384 && h <= 16384)) throw rpcError('BAD_REQUEST', '尺寸格式为 宽x高，例如 1080x1350');
        doc = await host('newDoc', { width: w, height: h, name: `${p.name}.psd`, background: a.background });
      }
      fs.writeFileSync(path.join(p.dir, 'project.json'), JSON.stringify({ name: p.name, createdAt: new Date().toISOString(), width: doc.width, height: doc.height, source: a.image ?? null }, null, 2));
      return { project: p.name, dir: p.dir, doc };
    },

    async open(a) {
      const p = useProject(a.project, false);
      const psd = path.join(p.dir, 'document.psd');
      if (!fs.existsSync(psd)) throw rpcError('NOT_FOUND', `项目 ${p.name} 还没有 document.psd（任务完成或 artgo save 后才会生成）`);
      const doc = await host('openImage', { name: `${p.name}.psd`, base64: fs.readFileSync(psd).toString('base64') });
      return { project: p.name, doc };
    },

    async assetAdd(a) {
      const p = need();
      const out = [];
      for (const file of a.files ?? []) {
        const f = readFile(file, a.cwd);
        const mime = MIME[path.extname(f.name).toLowerCase()];
        if (!mime) throw rpcError('BAD_REQUEST', `只支持 PNG/JPEG/WebP/GIF：${f.name}`);
        fs.copyFileSync(f.abs, path.join(p.dir, 'assets', f.name));
        out.push(await host('addAsset', { name: f.name, base64: f.base64, mime }));
      }
      return { assets: out };
    },

    async start(a) {
      const p = need();
      if (!String(a.prompt || '').trim()) throw rpcError('BAD_REQUEST', '需求为空');
      fs.writeFileSync(path.join(p.dir, 'brief.md'), `${a.prompt}\n`);
      return record(await host('start', { prompt: a.prompt, onlySelected: !!a.onlySelected }));
    },
    async call(a) { need(); return record(await host('call', { calls: a.calls })); },
    async finish(a) { need(); return record(await host('finish', { text: a.text })); },
    async wait() { need(); return record(await host('wait')); },
    async confirm(a) { need(); return record(await host('confirm', { approve: !!a.approve })); },
    async control(a) { need(); return record(await host('control', { action: a.action })); },
    async status() { return { project: project?.name ?? null, ...(await host('status', { after: Math.max(0, lastSeq - 20) })) }; },

    async export(a) {
      const p = need();
      const format = a.format || 'png';
      if (!['png', 'jpeg', 'psd', 'pcraft'].includes(format)) throw rpcError('BAD_REQUEST', '格式只能是 png / jpeg / psd / pcraft');
      const out = await host('exportDoc', { format });
      const ext = format === 'jpeg' ? 'jpg' : format;
      const file = a.out ? path.resolve(a.cwd || ROOT, a.out) : path.join(p.dir, 'exports', `${p.name}.${ext}`);
      fs.writeFileSync(file, Buffer.from(out.base64, 'base64'));
      return { file, bytes: fs.statSync(file).size };
    },

    async save() {
      const p = need();
      const out = await host('exportDoc', { format: 'psd' });
      fs.writeFileSync(path.join(p.dir, 'document.psd'), Buffer.from(out.base64, 'base64'));
      return { file: path.join(p.dir, 'document.psd') };
    },

    async skills() { return { skills: await host('skills'), synced: skillSync }; },
    async keyAdd(a) { return host('setKey', { provider: a.provider, apiKey: a.apiKey }); },
    async imageModel(a) { return host('setImageModel', { provider: a.provider, model: a.model, editModel: a.editModel }); },
    async down() { setTimeout(() => void shutdown(), 50); return { stopping: true }; },
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const authed = req.headers['x-artgo-token'] === token || url.searchParams.get('token') === token;
    const send = (status, body, type = 'application/json; charset=utf-8') => { res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' }); res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
    if (!authed) return send(401, { error: { code: 'UNAUTHORIZED', message: '缺少或错误的 token（见 .artgo/runtime.json）' } });
    try {
      if (req.method === 'GET' && url.pathname === '/') return send(200, progressPage(), 'text/html; charset=utf-8');
      if (req.method === 'GET' && url.pathname === '/api/status') return send(200, { data: await methods.status() });
      if (req.method === 'GET' && url.pathname === '/api/preview') {
        // Latest preview image of the current project (for the progress page).
        const dir = project && path.join(project.dir, 'previews');
        const files = dir && fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.png')).map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t) : [];
        if (!files.length) return send(404, { error: { code: 'NOT_FOUND', message: '还没有预览' } });
        return send(200, fs.readFileSync(path.join(dir, files[0].f)), 'image/png');
      }
      if (req.method === 'POST' && url.pathname === '/rpc') {
        const body = JSON.parse(await readBody(req));
        const fn = methods[body.method];
        if (!fn) return send(404, { error: { code: 'NOT_FOUND', message: `未知方法 ${body.method}` } });
        return send(200, { data: await fn(body.params ?? {}) });
      }
      send(404, { error: { code: 'NOT_FOUND', message: '接口不存在' } });
    } catch (e) {
      send(e.rpc ? 400 : 500, { error: { code: e.code || 'ERROR', message: String(e.message || e).replace(/^page\.evaluate: (Error: )?/, '').split('\n')[0] } });
    }
  });
  server.requestTimeout = 0;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });

  const info = { pid: process.pid, port: server.address().port, token, editorUrl, headed, mock, startedAt: new Date().toISOString() };
  fs.writeFileSync(RUNTIME, JSON.stringify(info, null, 2), { mode: 0o600 });

  let stopping = false;
  async function shutdown() {
    if (stopping) return;
    stopping = true;
    try { fs.rmSync(RUNTIME, { force: true }); } catch { /* already gone */ }
    server.close();
    await context.close().catch(() => undefined);
    await vite.close().catch(() => undefined);
    process.exit(0);
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  return info;
}

function rpcError(code, message) { return Object.assign(new Error(message), { code, rpc: true }); }

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 64 * 1024 * 1024) { reject(rpcError('BAD_REQUEST', '请求过大')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const port = Number(args[args.indexOf('--port') + 1]) || 5290;
  startDaemon({ headed: args.includes('--headed'), mock: args.includes('--mock'), port })
    .then((info) => console.log(JSON.stringify({ ready: true, port: info.port, editorUrl: info.editorUrl, headed: info.headed, mock: info.mock })))
    .catch((e) => { console.error(e?.stack || String(e)); process.exit(1); });
}
