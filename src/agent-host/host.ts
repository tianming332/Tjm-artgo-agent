// Agent host: the page-side API the artgo daemon drives through Playwright (window.__tjmHost).
// Documents and assets go through the editor's own store; tasks go through the same useAgent
// executor and workbench service as the built-in panel, with the external agent as the "model".
import { externalAgent, localAdmin, type ExternalTurn } from '../local/server.js';
import { useStore } from '../state/store';
import { useAgent, rid } from '../state/agent';
import { useAssets } from '../state/assets';
import { wbApi } from '../ai/api';
import { TERMINAL, type TaskSummary } from '../ai/contract';
import { formatTurnInput } from './format';

/** States in which the task waits on someone other than the external agent's next call. */
const HANDOFF = ['waiting_confirmation', 'paused', 'reconciling'];
const WAIT_MS = 15 * 60_000;

export interface TurnResult {
  state: string;
  task?: ReturnType<typeof brief>;
  /** Input for the external agent's next decision (tool results, review requests, previews). */
  turn?: { seq: number; rules?: string; input: unknown[] };
  confirmation?: { tool: string; args: unknown; stepId: string };
  calls?: { id: string; name: string }[];
  error?: string;
  hint?: string;
}

function brief(t: TaskSummary) {
  return {
    id: t.id, state: t.state, phases: t.phases, skill: t.skill?.slug ?? null, budget: t.budget, revision: t.observedRevision,
    ...(t.error ? { error: t.error } : {}), ...(t.resultText ? { resultText: t.resultText } : {}),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function hintFor(state: string): string | undefined {
  if (state === 'waiting_confirmation') return '该步骤需要用户确认：先向用户说明，再运行 artgo confirm yes 或 artgo confirm no';
  if (state === 'paused') return '任务已暂停：artgo resume 继续（之后先 doc_read）';
  if (state === 'reconciling') return '有一步结果不确定：先 artgo status 核对，再 artgo resume 或 artgo resume --retry';
  if (state === 'completed') return '任务完成：artgo export png／psd 导出';
  if (state === 'failed') return '任务失败：看 task.error；修正后用 artgo start 重新发起';
  return undefined;
}

/** Waits until the external agent has something to decide, or the task hands off / ends. */
async function settle(afterSeq: number, rules = false, started?: Promise<void>, leaving?: string): Promise<TurnResult> {
  const deadline = Date.now() + WAIT_MS;
  let startDone = !started;
  void started?.finally(() => { startDone = true; });
  while (Date.now() < deadline) {
    const p: ExternalTurn | null = externalAgent.pending();
    const task = useAgent.getState().task;
    if (p && p.seq > afterSeq) {
      const fresh = task ? await wbApi.task(task.id).catch(() => task) : undefined;
      return { state: fresh?.state ?? 'waiting_model', ...(fresh ? { task: brief(fresh) } : {}), turn: { seq: p.seq, ...(rules && p.system ? { rules: p.system } : {}), input: formatTurnInput(p.input) } };
    }
    if (task) {
      const fresh = await wbApi.task(task.id).catch(() => task);
      // The state the action is leaving (e.g. waiting_confirmation for confirm) is not an answer yet.
      const still = fresh.state === leaving && !startDone;
      if (!still && (TERMINAL.includes(fresh.state) || HANDOFF.includes(fresh.state))) {
        const step = fresh.state === 'waiting_confirmation' ? fresh.steps.find((s) => s.needsConfirmation && !s.confirmed && s.status === 'pending') : undefined;
        return { state: fresh.state, task: brief(fresh), ...(step ? { confirmation: { tool: step.tool, args: step.args, stepId: step.stepId } } : {}), hint: hintFor(fresh.state) };
      }
    }
    const err = useAgent.getState().error;
    if (err && startDone && !externalAgent.pending()) return { state: task?.state ?? 'error', error: err };
    await sleep(120);
  }
  return { state: 'running', hint: '仍在执行（例如生图较慢）：运行 artgo wait 继续等待' };
}

function activeTab(docId?: string) {
  const st = useStore.getState();
  return st.tabs.find((t) => t.docId === (docId ?? st.activeDocId));
}

async function docInfo(docId?: string) {
  const tab = activeTab(docId);
  if (!tab) throw new Error('没有打开的文档：先 artgo new 或 artgo open');
  const info = await tab.session.inspect();
  return { docId: tab.docId, name: tab.name, width: info.width, height: info.height, revision: tab.session.currentRevision };
}

const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
function bytesToB64(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function currentTask() {
  const t = useAgent.getState().task;
  if (!t) throw new Error('还没有任务：先 artgo start "<需求>"');
  return t;
}

const host = {
  ready: true,
  attached: false,

  /** Called once by the daemon. Tasks left over from an earlier run can never resume (documents
   *  reopen under new engine ids), so they are cancelled to free the one-active-task slot. */
  async attach() {
    host.attached = true;
    const tasks = await wbApi.capabilities().then(() => fetch('/api/workbench/tasks').then((r) => r.json())).catch(() => ({ data: [] }));
    for (const t of (tasks.data ?? []) as TaskSummary[]) if (!TERMINAL.includes(t.state)) await wbApi.cancel(t.id).catch(() => undefined);
    return { attached: true };
  },

  async newDoc(a: { width: number; height: number; name?: string; background?: 'white' | 'black' | 'transparent' }) {
    await useStore.getState().newDocument(a.width, a.height, { name: a.name, background: a.background ?? 'white' });
    const err = useStore.getState().error;
    if (err) throw new Error(err);
    return docInfo();
  },

  async openImage(a: { name: string; base64: string }) {
    await useStore.getState().openFile(new File([b64ToBytes(a.base64)], a.name));
    const err = useStore.getState().error;
    if (err) throw new Error(err);
    return docInfo();
  },

  async docs() {
    const st = useStore.getState();
    return { active: st.activeDocId ?? null, docs: st.tabs.map((t) => ({ docId: t.docId, name: t.name })) };
  },

  async addAsset(a: { name: string; base64: string; mime: string }) {
    const rec = await wbApi.uploadAsset(`data:${a.mime};base64,${a.base64}`, a.name);
    void useAssets.getState().refresh();
    return { id: rec.id, name: rec.name, width: rec.width, height: rec.height };
  },

  async start(a: { prompt: string; onlySelected?: boolean }) {
    const prev = useAgent.getState().task;
    if (prev && !TERMINAL.includes(prev.state)) throw new Error(`任务 ${prev.id} 尚未结束（${prev.state}）：先 artgo finish 或 artgo cancel`);
    await docInfo();
    useAgent.setState({ task: undefined, events: [], error: undefined });
    const after = externalAgent.seq;
    const started = useAgent.getState().start(a.prompt, !!a.onlySelected);
    return settle(after, true, started);
  },

  async call(a: { calls: { name: string; args?: Record<string, unknown> }[] }) {
    if (!Array.isArray(a.calls) || !a.calls.length) throw new Error('calls 为空');
    const after = externalAgent.seq;
    const sent = externalAgent.respond({ calls: a.calls });
    return { ...(await settle(after)), calls: sent.map(({ id, name }) => ({ id, name })) };
  },

  async finish(a: { text: string }) {
    const after = externalAgent.seq;
    externalAgent.respond({ calls: [], text: a.text || '完成' });
    return settle(after);
  },

  async wait() {
    const p = externalAgent.pending();
    return settle(p ? p.seq - 1 : externalAgent.seq);
  },

  // act() for approve / reject / resume runs the next model turn inside its request, i.e. it only
  // returns after the external agent answers: never await it here, settle on the turn instead.
  async confirm(a: { approve: boolean }) {
    currentTask();
    const after = externalAgent.seq;
    useAgent.setState({ error: undefined });
    return settle(after, false, useAgent.getState().act(a.approve ? 'approve' : 'reject'), 'waiting_confirmation');
  },

  async control(a: { action: 'pause' | 'resume' | 'retry' | 'cancel' }) {
    currentTask();
    const after = externalAgent.seq;
    useAgent.setState({ error: undefined });
    if (a.action === 'resume' || a.action === 'retry') return settle(after, false, useAgent.getState().act(a.action), useAgent.getState().task?.state);
    await useAgent.getState().act(a.action);
    const fresh = await wbApi.task(currentTask().id);
    // The parked turn is closed (recorded, not executed); resume opens a fresh one.
    if (fresh.state === 'paused' || fresh.state === 'cancelled') externalAgent.release();
    const err = useAgent.getState().error;
    if (err) return { state: fresh.state, error: err };
    return { state: fresh.state, task: brief(fresh), hint: hintFor(fresh.state) };
  },

  async status(a: { after?: number } = {}) {
    const t = useAgent.getState().task;
    const fresh = t ? await wbApi.task(t.id).catch(() => t) : undefined;
    const ev = fresh ? await wbApi.events(fresh.id, a.after ?? 0).catch(() => ({ events: [] })) : { events: [] };
    const doc = activeTab() ? await docInfo().catch(() => null) : null;
    return {
      doc, waitingForAgent: !!externalAgent.pending(),
      task: fresh ? { ...brief(fresh), prompt: fresh.prompt, steps: fresh.steps.map((s) => ({ tool: s.tool, status: s.status, ...(s.error ? { error: s.error.message } : s.receipt?.error ? { error: s.receipt.error.message } : {}) })) } : null,
      events: ev.events,
    };
  },

  async exportDoc(a: { format: 'png' | 'jpeg' | 'psd' | 'pcraft'; docId?: string }) {
    const tab = activeTab(a.docId ?? useAgent.getState().task?.target.docId);
    if (!tab) throw new Error('没有可导出的文档');
    const { bytes } = await tab.session.save(a.format);
    if (!bytes || bytes.byteLength === 0) throw new Error(`导出 ${a.format} 失败`);
    return { name: tab.name, format: a.format, base64: bytesToB64(new Uint8Array(bytes)) };
  },

  async skills() {
    const s = await localAdmin<{ skills: { id: number; slug: string; name: string; category: string; description: string; status: string; version: number }[] }>('state');
    return s.skills.map(({ slug, name, category, description, status, version }) => ({ slug, name, category, description, status, version }));
  },

  /** Custom skills from the repo's skills/ folder: created or updated, then published. */
  async syncSkills(a: { skills: { slug: string; name: string; category?: string; description?: string; triggers?: string; tools?: string[]; body: string }[] }) {
    const existing = (await localAdmin<{ skills: { id: number; slug: string; body: string; tools: string[]; name: string; category: string; description: string; triggers: string; status: string }[] }>('state')).skills;
    const out = [];
    for (const s of a.skills) {
      try {
        const prev = existing.find((x) => x.slug === s.slug);
        const same = prev && prev.status === 'published' && prev.body === s.body && prev.name === s.name && (prev.category || 'workflow') === (s.category || 'workflow')
          && (prev.description || '') === (s.description || '') && (prev.triggers || '') === (s.triggers || '') && JSON.stringify(prev.tools) === JSON.stringify(s.tools ?? []);
        if (same) { out.push({ slug: s.slug, status: 'unchanged' }); continue; }
        const saved = prev
          ? await localAdmin<{ id: number }>(`skills/${prev.id}`, 'PUT', s)
          : await localAdmin<{ id: number }>('skills', 'POST', s);
        const pub = await localAdmin<{ version: number }>(`skills/${saved.id}/publish`, 'POST', {});
        out.push({ slug: s.slug, status: prev ? 'updated' : 'created', version: pub.version });
      } catch (e) { out.push({ slug: s.slug, status: 'error', error: (e as Error).message }); }
    }
    return out;
  },

  async setKey(a: { provider: string; apiKey: string }) {
    await localAdmin(`providers/${encodeURIComponent(a.provider)}/keys`, 'POST', { name: `cli-${rid('k').slice(-6)}`, apiKey: a.apiKey });
    return { provider: a.provider, saved: true };
  },

  /** Image generation vendor + model (Gemini uses its text-to-image / edit model pair). */
  async setImageModel(a: { provider: string; model?: string; editModel?: string }) {
    if (a.provider === 'gemini') {
      if (a.model || a.editModel) await localAdmin('gemini', 'PUT', { ...(a.model ? { textModel: a.model } : {}), ...(a.editModel ? { editModel: a.editModel } : {}) });
      await localAdmin('config', 'PUT', { models: { imageProvider: 'gemini' } });
    } else {
      await localAdmin('config', 'PUT', { models: { imageProvider: a.provider, ...(a.model ? { imageModel: a.model } : {}) } });
    }
    const caps = await wbApi.capabilities();
    return { imageEnabled: caps.imageEnabled, image: caps.models?.image ?? [] };
  },
};

export type TjmHost = typeof host;

export function installAgentHost() {
  Object.assign(window, { __tjmHost: host });
}

export const isHostAttached = () => host.attached;
