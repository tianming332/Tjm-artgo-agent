// External agent as a model adapter: the workbench service asks for a "model turn", and instead
// of calling a vendor it parks the turn here until the user's own coding agent (via the artgo CLI)
// answers with the next tool calls or with "done". Everything else — workflow gate, skill tool
// whitelist, budgets, confirmations, editor leases, final preview review — stays in service.js.

export const EXTERNAL_MAX_TURNS = 400;

export function createExternalAgent({ maxTurns = EXTERNAL_MAX_TURNS, mockImages = false } = {}) {
  let seq = 0;
  let callN = 0;
  /** The turn currently waiting for the external agent: { seq, system, input, resolve }. */
  let waiting = null;
  const watchers = new Set();

  return {
    external: true,
    maxTurns,
    mockImages,

    /** Called by service.js modelTurn(); resolves once the external agent replies. */
    agentTurn(turnInput) {
      return new Promise((resolve) => {
        seq += 1;
        waiting = { seq, system: turnInput.system, input: turnInput.input ?? [], resolve };
        for (const w of [...watchers]) w();
      });
    },

    /** The parked turn, if any (without its resolver). */
    pending() {
      return waiting ? { seq: waiting.seq, system: waiting.system, input: waiting.input } : null;
    },

    get seq() { return seq; },

    /** Answers the parked turn. `calls` empty = the agent reports it is done (text = summary). */
    respond({ calls = [], text = '' } = {}) {
      if (!waiting) throw Object.assign(new Error('没有等待外部 Agent 的回合（任务可能在执行、等待确认或已结束）'), { code: 'BAD_STATE' });
      const w = waiting;
      waiting = null;
      const out = calls.map((c) => ({ id: `ext-${++callN}`, name: String(c.name), args: c.args ?? {} }));
      w.resolve({ text: String(text || ''), calls: out });
      return out;
    },

    /** Resolves when a turn newer than `afterSeq` is parked (or immediately if one already is). */
    nextTurn(afterSeq) {
      if (waiting && waiting.seq > afterSeq) return Promise.resolve(this.pending());
      return new Promise((resolve) => {
        const w = () => {
          if (waiting && waiting.seq > afterSeq) { watchers.delete(w); resolve(this.pending()); }
        };
        watchers.add(w);
      });
    },

    /** Unblocks a parked turn when its task is cancelled from outside (the result is ignored). */
    release() {
      if (waiting) this.respond({ calls: [], text: '' });
    },
  };
}
