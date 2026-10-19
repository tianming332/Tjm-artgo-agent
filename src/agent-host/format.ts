/** service.js pendingInput → what the CLI hands to the external agent. */
export function formatTurnInput(input: any[]): unknown[] {
  return input.map((i) => {
    if (i.type === 'function_result') return { type: 'result', tool: i.name, callId: i.callId, ...i.result };
    if (i.type === 'image') return { type: 'image', mime: i.mime, data: i.data };
    if (i.type === 'text') return { type: 'text', text: i.text };
    return i;
  });
}
