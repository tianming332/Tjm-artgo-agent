export function handleLocal(request: Request): Promise<Response>;
export function installLocalBackend(): void;
export function localAdmin<T = any>(path: string, method?: string, body?: unknown): Promise<T>;

export interface ExternalTurn { seq: number; system?: string; input: any[] }
export interface ExternalAgent {
  readonly external: true;
  readonly maxTurns: number;
  readonly mockImages: boolean;
  readonly seq: number;
  pending(): ExternalTurn | null;
  respond(out: { calls?: { name: string; args?: Record<string, unknown> }[]; text?: string }): { id: string; name: string; args: Record<string, unknown> }[];
  nextTurn(afterSeq: number): Promise<ExternalTurn>;
  release(): void;
}
export const externalAgent: ExternalAgent;
