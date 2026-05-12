/**
 * BrainClient — public TypeScript SDK for the Suraya brain.
 *
 * Wraps the HTTP API at /api/brain/* with HMAC signing, typed
 * responses, and a discriminated error model. No external deps —
 * just web fetch + Web Crypto.
 */
import {
  type ObservationInput,
  type EmitResponse,
  type RetrieveResponse,
  type HealthResponse,
  BrainError,
} from "./types.js";

export type BrainClientOptions = {
  baseUrl: string;
  projectSlug: string;
  hmacSecret?: string;
  bootstrapToken?: string;
  // Optional fetch override for testing.
  fetchImpl?: typeof fetch;
};

const SIGNATURE_HEADER = "X-Suraya-Signature";

export type RetrieveArgs = {
  q: string;
  topK?: number;
  scope?: string | null;
};

export class BrainClient {
  private baseUrl: string;
  private projectSlug: string;
  private hmacSecret: string | null;
  private bootstrapToken: string | null;
  private fetchImpl: typeof fetch;

  constructor(opts: BrainClientOptions) {
    if (!opts.hmacSecret && !opts.bootstrapToken) {
      throw new Error(
        "BrainClient requires exactly one of hmacSecret or bootstrapToken"
      );
    }
    if (opts.hmacSecret && opts.bootstrapToken) {
      throw new Error(
        "BrainClient: only one of hmacSecret or bootstrapToken may be set"
      );
    }
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.projectSlug = opts.projectSlug;
    this.hmacSecret = opts.hmacSecret ?? null;
    this.bootstrapToken = opts.bootstrapToken ?? null;
    this.fetchImpl = opts.fetchImpl ?? fetch.bind(globalThis);
  }

  async retrieve(args: RetrieveArgs): Promise<RetrieveResponse> {
    const topK = clampInt(args.topK ?? 10, 1, 50);
    const canonical = `${this.projectSlug}|${args.q}|${topK}`;
    const sig = await this.signCanonical(canonical);

    const url = new URL(`${this.baseUrl}/api/brain/retrieve`);
    url.searchParams.set("q", args.q);
    url.searchParams.set("project_slug", this.projectSlug);
    url.searchParams.set("top_k", String(topK));
    if (args.scope) url.searchParams.set("scope", args.scope);

    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: {
        [SIGNATURE_HEADER]: sig,
        Accept: "application/json",
      },
    });
    return this.handleResponse<RetrieveResponse>(res, "retrieve");
  }

  async emitObservation(obs: ObservationInput): Promise<EmitResponse> {
    const payload: ObservationInput = {
      ...obs,
      project_slug: obs.project_slug ?? this.projectSlug,
    };
    const body = JSON.stringify(payload);
    const sig = await this.signCanonical(body);

    const res = await this.fetchImpl(`${this.baseUrl}/api/brain/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [SIGNATURE_HEADER]: sig,
      },
      body,
    });
    return this.handleResponse<EmitResponse>(res, "emit");
  }

  async health(): Promise<HealthResponse> {
    const res = await this.fetchImpl(`${this.baseUrl}/health`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    return this.handleResponse<HealthResponse>(res, "health");
  }

  private async signCanonical(canonical: string): Promise<string> {
    if (this.bootstrapToken) {
      // Bootstrap tokens are pre-signed; the server validates as a bearer
      // and re-derives the project HMAC server-side. We include the token
      // here in the signature slot per the wire contract documented in
      // suraya-brain/docs/auth.md (the brain accepts EITHER an HMAC of
      // the canonical or a bootstrap-token literal).
      return `bt:${this.bootstrapToken}`;
    }
    if (!this.hmacSecret) {
      throw new Error("No signing material configured");
    }
    return await hmacSha256Hex(this.hmacSecret, canonical);
  }

  private async handleResponse<T>(res: Response, op: string): Promise<T> {
    if (res.ok) {
      try {
        return (await res.json()) as T;
      } catch (err) {
        throw new BrainError({
          kind: "server_error",
          message: `${op}: response not JSON: ${err instanceof Error ? err.message : String(err)}`,
          status: res.status,
        });
      }
    }
    const retryAfterRaw = res.headers.get("retry-after");
    const retryAfter = retryAfterRaw ? parseInt(retryAfterRaw, 10) : undefined;
    const bodyText = await res.text().catch(() => "");
    switch (res.status) {
      case 400:
        throw new BrainError({
          kind: "validation_failed",
          status: 400,
          message: `${op}: validation failed: ${bodyText.slice(0, 300)}`,
        });
      case 401:
        throw new BrainError({
          kind: "invalid_signature",
          status: 401,
          message: `${op}: invalid signature`,
        });
      case 404:
        throw new BrainError({
          kind: "not_found",
          status: 404,
          message: `${op}: not found`,
        });
      case 429:
        throw new BrainError({
          kind: "rate_limited",
          status: 429,
          message: `${op}: rate limited`,
          ...(retryAfter !== undefined ? { retryAfterSeconds: retryAfter } : {}),
        });
      default:
        throw new BrainError({
          kind: "server_error",
          status: res.status,
          message: `${op}: ${res.status} ${bodyText.slice(0, 300)}`,
        });
    }
  }
}

function clampInt(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
