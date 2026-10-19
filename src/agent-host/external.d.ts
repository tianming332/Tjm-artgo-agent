import type { ExternalAgent } from '../local/server.js';

export const EXTERNAL_MAX_TURNS: number;
export function createExternalAgent(opts?: { maxTurns?: number; mockImages?: boolean }): ExternalAgent & {
  agentTurn(turnInput: { system?: string; input?: unknown[] }): Promise<{ text: string; calls: { id: string; name: string; args: Record<string, unknown> }[] }>;
};
