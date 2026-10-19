import { describe, expect, it } from 'vitest';
import { createExternalAgent } from './external.js';
import { formatTurnInput } from './format';

describe('external agent adapter', () => {
  it('parks a model turn until the agent answers with calls', async () => {
    const ext = createExternalAgent({ maxTurns: 5 });
    expect(ext.pending()).toBeNull();
    const turn = ext.agentTurn({ system: 'rules', input: [{ type: 'text', text: 'brief' }] });
    expect(ext.pending()).toMatchObject({ seq: 1, system: 'rules' });
    const sent = ext.respond({ calls: [{ name: 'doc_read' }, { name: 'text_create', args: { text: 'a', x: 1, y: 2 } }] });
    expect(sent.map((c) => c.id)).toEqual(['ext-1', 'ext-2']);
    await expect(turn).resolves.toEqual({ text: '', calls: [{ id: 'ext-1', name: 'doc_read', args: {} }, { id: 'ext-2', name: 'text_create', args: { text: 'a', x: 1, y: 2 } }] });
    expect(ext.pending()).toBeNull();
  });

  it('done = no calls; responding without a parked turn is refused', async () => {
    const ext = createExternalAgent();
    expect(() => ext.respond({ text: 'x' })).toThrow(/没有等待/);
    const turn = ext.agentTurn({ input: [] });
    ext.respond({ text: '完成' });
    await expect(turn).resolves.toEqual({ text: '完成', calls: [] });
  });

  it('nextTurn resolves only for a newer turn', async () => {
    const ext = createExternalAgent();
    void ext.agentTurn({ input: [] });
    const first = await ext.nextTurn(0);
    expect(first.seq).toBe(1);
    const later = ext.nextTurn(1);
    ext.respond({ calls: [{ name: 'doc_read' }] });
    void ext.agentTurn({ input: [{ type: 'text', text: 'next' }] });
    await expect(later).resolves.toMatchObject({ seq: 2 });
    ext.release();
    expect(ext.pending()).toBeNull();
  });

  it('formats service input for the CLI', () => {
    expect(formatTurnInput([
      { type: 'function_result', callId: 'ext-1', name: 'doc_read', result: { ok: true, value: { width: 10 } } },
      { type: 'image', mime: 'image/png', data: 'AAAA' },
      { type: 'text', text: 'note' },
    ])).toEqual([
      { type: 'result', tool: 'doc_read', callId: 'ext-1', ok: true, value: { width: 10 } },
      { type: 'image', mime: 'image/png', data: 'AAAA' },
      { type: 'text', text: 'note' },
    ]);
  });
});
