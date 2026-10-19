#!/usr/bin/env node
// artgo: the command line an external coding agent uses to drive Art GO Agent.
// Every command prints one JSON object on stdout; exit code 1 means { error }.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE_DIR = process.env.ARTGO_STATE_DIR ? path.resolve(process.env.ARTGO_STATE_DIR) : path.join(ROOT, '.artgo');
const RUNTIME = path.join(STATE_DIR, 'runtime.json');
const LOG = path.join(STATE_DIR, 'daemon.log');

const HELP = `artgo — Art GO Agent 命令行（输出均为 JSON）

运行时
  artgo up [--headed] [--mock] [--port N]   后台启动（--headed 显示编辑器窗口；--mock 模拟生图）
  artgo down | artgo health
  artgo progress                            打印只读进度页地址

项目与素材
  artgo new <项目> [--size 1080x1350] [--image 图片] [--background white|black|transparent]
  artgo open <项目>                         打开项目里的 document.psd
  artgo asset add <文件...>                 加入素材库（assets_list 可见）

任务（工作流：report_analysis → assets_list → skill_list/skill_load → 编辑 → doc_lint/doc_preview → finish）
  artgo start "<需求>" [--only-selected]
  artgo call <工具> ['<json 参数>']         一个调用
  artgo call -f calls.json | artgo call -     多个调用：[{"name":"…","args":{…}}, …]
  artgo finish "<完成说明>"
  artgo wait                                继续等待仍在执行的步骤
  artgo confirm yes|no                      需要用户确认的步骤（先问用户）
  artgo pause | artgo resume [--retry] | artgo cancel
  artgo status

查询与导出
  artgo tools [工具名]                      工具清单／某个工具的参数 schema
  artgo skills                              Skill 库（内置 + skills/*.md）
  artgo export png|jpeg|psd|pcraft [--out 路径]
  artgo save                                写入 projects/<项目>/document.psd

设置（Key 只保存在本机浏览器配置 .artgo/chrome 中）
  echo $KEY | artgo key add <gemini|openai|glm|qwen|doubao|anthropic|deepseek>
  artgo image-model <服务商> [模型] [--edit 模型]
`;

function out(value, code = 0) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  process.exit(code);
}
const fail = (code, message, extra = {}) => out({ error: { code, message, ...extra } }, 1);

function flag(args, name) {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, v === undefined || v.startsWith('--') ? 1 : 2);
  return v === undefined || v.startsWith('--') ? true : v;
}

function runtime() {
  try { return JSON.parse(fs.readFileSync(RUNTIME, 'utf8')); } catch { return null; }
}

async function request(rt, method, params = {}) {
  const res = await fetch(`http://127.0.0.1:${rt.port}/rpc`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-artgo-token': rt.token },
    body: JSON.stringify({ method, params: { ...params, cwd: process.cwd() } }),
  });
  const json = await res.json();
  if (json.error) fail(json.error.code, json.error.message);
  return json.data;
}

async function rpc(method, params) {
  const rt = runtime();
  if (!rt) fail('NOT_RUNNING', '运行时未启动：先运行 artgo up');
  try { return await request(rt, method, params); }
  catch (e) { fail('NOT_RUNNING', `连不上运行时（${e.message}）：artgo up 重新启动`); }
}

const readStdin = () => new Promise((resolve) => { let s = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', (c) => { s += c; }); process.stdin.on('end', () => resolve(s)); });

function parseJson(text, what) {
  try { return JSON.parse(text); } catch (e) { return fail('BAD_REQUEST', `${what} 不是合法 JSON：${e.message}`); }
}

async function up(args) {
  const rt = runtime();
  if (rt) {
    try { return out({ running: true, ...(await request(rt, 'health')) }); } catch { /* stale runtime file */ }
  }
  fs.mkdirSync(path.dirname(LOG), { recursive: true });
  const log = fs.openSync(LOG, 'a');
  const child = spawn(process.execPath, [path.join(ROOT, 'runtime', 'daemon.mjs'), ...args], { cwd: ROOT, detached: true, stdio: ['ignore', log, log] });
  child.unref();
  const started = Date.now();
  while (Date.now() - started < 180_000) {
    await new Promise((r) => setTimeout(r, 500));
    const next = runtime();
    if (next && next.pid === child.pid) {
      try { return out({ running: true, ...(await request(next, 'health')) }); } catch { /* still starting */ }
    }
    if (child.exitCode !== null) break;
  }
  fail('START_FAILED', `运行时没有启动，见 ${path.relative(process.cwd(), LOG)}`);
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args.shift();
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') { process.stdout.write(HELP); return; }

  switch (cmd) {
    case 'up': return up(args);
    case 'down': return out(await rpc('down'));
    case 'health': return out(await rpc('health'));
    case 'progress': {
      const rt = runtime() ?? fail('NOT_RUNNING', '运行时未启动：先运行 artgo up');
      return out({ url: `http://127.0.0.1:${rt.port}/?token=${rt.token}` });
    }
    case 'new': {
      const size = flag(args, '--size'), image = flag(args, '--image'), background = flag(args, '--background');
      if (!args[0]) fail('BAD_REQUEST', '用法：artgo new <项目> [--size 1080x1350] [--image 图片]');
      return out(await rpc('new', { project: args[0], size, image, background }));
    }
    case 'open': return out(await rpc('open', { project: args[0] }));
    case 'asset': {
      if (args.shift() !== 'add' || !args.length) fail('BAD_REQUEST', '用法：artgo asset add <文件...>');
      return out(await rpc('assetAdd', { files: args }));
    }
    case 'start': {
      const onlySelected = !!flag(args, '--only-selected');
      return out(await rpc('start', { prompt: args.join(' '), onlySelected }));
    }
    case 'call': {
      let calls;
      const file = flag(args, '-f');
      if (file === '-' || (!file && args[0] === '-')) calls = parseJson(await readStdin(), '标准输入');
      else if (file) calls = parseJson(fs.readFileSync(path.resolve(String(file)), 'utf8'), String(file));
      else if (args[0]) calls = [{ name: args[0], args: args[1] ? parseJson(args[1], '参数') : {} }];
      else fail('BAD_REQUEST', "用法：artgo call <工具> '<json>'  或  artgo call -f calls.json");
      if (!Array.isArray(calls)) calls = [calls];
      calls = calls.map((c) => ({ name: c.name ?? c.tool, args: c.args ?? {} }));
      return out(await rpc('call', { calls }));
    }
    case 'finish': return out(await rpc('finish', { text: args.join(' ') }));
    case 'wait': return out(await rpc('wait'));
    case 'confirm': {
      const v = String(args[0] || '').toLowerCase();
      if (!['yes', 'no', 'y', 'n'].includes(v)) fail('BAD_REQUEST', '用法：artgo confirm yes|no');
      return out(await rpc('confirm', { approve: v.startsWith('y') }));
    }
    case 'pause': case 'cancel': return out(await rpc('control', { action: cmd }));
    case 'resume': return out(await rpc('control', { action: flag(args, '--retry') ? 'retry' : 'resume' }));
    case 'status': return out(await rpc('status'));
    case 'tools': {
      // Read straight from the catalog: works without the runtime.
      const { TOOLS } = await import(pathToFileURL(path.join(ROOT, 'src/local/backend/workbench/tools.js')).href);
      if (args[0]) {
        const t = TOOLS.find((x) => x.name === args[0]) ?? fail('NOT_FOUND', `没有工具 ${args[0]}`);
        return out({ name: t.name, kind: t.kind, risk: t.risk, where: t.where, phase: t.phase ?? null, description: t.description, params: t.params });
      }
      return out({ tools: TOOLS.map((t) => ({ name: t.name, kind: t.kind, risk: t.risk, summary: t.description.split(/[。；]/)[0].slice(0, 80) })) });
    }
    case 'skills': return out(await rpc('skills'));
    case 'export': {
      const o = flag(args, '--out');
      return out(await rpc('export', { format: args[0] || 'png', out: o === true ? undefined : o }));
    }
    case 'save': return out(await rpc('save'));
    case 'key': {
      if (args[0] !== 'add' || !args[1]) fail('BAD_REQUEST', '用法：echo $KEY | artgo key add <服务商>');
      if (process.stdin.isTTY) fail('BAD_REQUEST', 'Key 从标准输入读取（避免进入命令历史）：echo "$GEMINI_API_KEY" | artgo key add gemini');
      const apiKey = (await readStdin()).trim();
      if (!apiKey) fail('BAD_REQUEST', '标准输入里没有 Key');
      return out(await rpc('keyAdd', { provider: args[1], apiKey }));
    }
    case 'image-model': {
      const editModel = flag(args, '--edit');
      if (!args[0]) fail('BAD_REQUEST', '用法：artgo image-model <服务商> [模型] [--edit 模型]');
      return out(await rpc('imageModel', { provider: args[0], model: args[1], editModel: editModel === true ? undefined : editModel }));
    }
    default: fail('BAD_REQUEST', `未知命令 ${cmd}；artgo help 查看用法`);
  }
}

main().catch((e) => fail('ERROR', String(e?.message || e)));
