export type ObservationType =
  | "decision"
  | "failure"
  | "fix"
  | "style"
  | "deviation"
  | "correction"
  | "scope_state";

export type Criticality = "low" | "medium" | "high";

export type MemoryNodeScope = "project" | "shared";

export type MemoryNodeStatus = "draft" | "proposed" | "standard" | "historic";

export type RetrieveResult = {
  node_id: string;
  scope: MemoryNodeScope;
  project_slug: string | null;
  type: ObservationType;
  status: MemoryNodeStatus;
  representative_summary: string;
  tags: string[];
  confidence: number;
  similarity: number;
  evidence_count: number;
  last_reinforced_at: string | null;
  sample_observation_ids: string[];
};

export type RetrieveResponse = {
  results: RetrieveResult[];
  query_embedded_in_ms: number;
  search_in_ms: number;
};

export type ObservationInput = {
  type: ObservationType;
  representative_summary: string;
  criticality: Criticality;
  actor_handle: string;
  project_slug?: string;
  tags?: string[];
  // Optional links to other observations (e.g. a fix linking back to a failure).
  linked_observation_ids?: string[];
  // Free-form structured payload — recipe / capture-specific.
  payload?: Record<string, unknown>;
  // ISO timestamps; defaulted server-side if omitted.
  validity_start?: string;
  validity_end?: string;
};

export type EmitResponse = {
  observation_id: string;
  status: "accepted" | "queued";
};

export type HealthResponse = {
  ok: boolean;
  version: string;
  build: string;
};

export type BrainErrorKind =
  | "invalid_signature"
  | "rate_limited"
  | "not_found"
  | "network"
  | "server_error"
  | "validation_failed";

export class BrainError extends Error {
  kind: BrainErrorKind;
  status?: number;
  retryAfterSeconds?: number;

  constructor(args: {
    kind: BrainErrorKind;
    message: string;
    status?: number;
    retryAfterSeconds?: number;
  }) {
    super(args.message);
    this.name = "BrainError";
    this.kind = args.kind;
    if (args.status !== undefined) this.status = args.status;
    if (args.retryAfterSeconds !== undefined)
      this.retryAfterSeconds = args.retryAfterSeconds;
  }
}
