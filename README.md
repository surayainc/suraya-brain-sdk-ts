# @surayaorg/brain-sdk

TypeScript client for the Suraya brain. MIT-licensed. For any agent, app, or human-driven script that wants to read the typed observation graph or contribute to it.

> **Sandbox note.** This package lives in the suraya meta repo at `apps/brain-sdk-ts/` until its dedicated repo at `surayainc/suraya-brain-sdk-ts` exists (queued as OQ-12 in the operator action queue). On creation, this directory moves and the npm publish points at the new repo.

## Install

```bash
npm install @surayaorg/brain-sdk
```

## Quick start

```typescript
import { BrainClient } from "@surayaorg/brain-sdk";

const brain = new BrainClient({
  baseUrl: "https://brain.suraya.ai",
  projectSlug: "my-project",
  hmacSecret: process.env.SURAYA_BRAIN_WEBHOOK_SECRET_MY_PROJECT!,
});

// Retrieve memory nodes matching a query
const { results } = await brain.retrieve({
  q: "supabase pooler create index concurrently",
  topK: 10,
});

for (const r of results) {
  console.log(r.representative_summary, r.similarity.toFixed(3));
}
```

## Auth model

The SDK takes one of:

- **Per-project HMAC secret** (`hmacSecret` option): used as long-lived service-to-service auth. Stored in your secret manager (Doppler, env, Vault, whatever).
- **F6 bootstrap token** (`bootstrapToken` option): for ephemeral device-bound auth. Read once on first activation from the Suraya credential bridge, sealed locally thereafter.

Exactly one of `hmacSecret` or `bootstrapToken` must be set.

## API

### `retrieve(opts)`

Semantic search over memory_nodes. Returns the top-k matches with representative summaries, tags, similarity scores, and a sample of contributing observations.

| Param | Type | Default | Notes |
|---|---|---|---|
| `q` | string | required | The query string. Embedded via Voyage on the server. |
| `topK` | number | 10 | Max 50. |
| `scope` | string \| null | null | Optional scope_id filter; narrows to memory_nodes whose contributing observations are in this scope. |

### `emitObservation(observation)`

Ships a single observation to the brain. Synchronous; awaits the ingest 2xx before resolving.

| Required field | Type | Notes |
|---|---|---|
| `type` | string | One of `decision`, `failure`, `fix`, `style`, `deviation`, `correction`, `scope_state` |
| `representative_summary` | string | One-line, ≤ 300 chars |
| `criticality` | `low` \| `medium` \| `high` | Used in the importance formula |
| `actor_handle` | string | Capturing operator |
| `project_slug` | string | Defaults to the client's projectSlug |

See [`@surayaorg/brain-sdk/types`](./src/types.ts) for the full observation schema.

### `health()`

Cheap probe that confirms credentials are valid and the brain is reachable. Returns `{ ok: true, version, build }`.

## Errors

The SDK throws `BrainError` with a discriminated `kind`:

- `'invalid_signature'` — HMAC verification failed (rotated secret? wrong project_slug?)
- `'rate_limited'` — server-side rate limit hit; respect `retry_after`
- `'not_found'` — endpoint or resource missing
- `'network'` — fetch threw; client should retry with backoff
- `'server_error'` — 5xx from the brain; logged + retriable

Catch `BrainError` if you care about a specific kind; let it bubble otherwise.

## Versioning

Semver from day 1. Breaking changes ship in major releases with a [migration guide](./CHANGELOG.md). The current major is 0.x (pre-1.0) and breaking changes are explicitly possible during the v0.6 schema iteration window.

## Status (2026-05-23)

- ✅ Layout scaffolded
- ✅ `BrainClient.retrieve()` reference implementation
- ❌ `BrainClient.emitObservation()` — wired against the existing brain ingest endpoint; lands next
- ❌ Python sister package `@surayaorg/brain-sdk-py` — queued as G2 follow-up
- ❌ npm publish — gated on operator action (OQ-15 register `@suraya` npm org + automation token)
