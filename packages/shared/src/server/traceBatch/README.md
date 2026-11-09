# Trace-batch input storage

`createTraceBatchInputStorage()` provides `put` and `get` for versioned inputs,
using a project/trace/revision reference and one lazily initialized provider
client shared across factory calls. The live inputs contain a nullable transcript,
its execution issues (empty without a transcript) and required trace context. Session ID and trace name are nullable; context
timestamps stay ISO strings.

## Stored format and versioning

`versions/v1.ts` owns the complete V1 envelope: `schemaVersion`, `transcript`,
`executionIssues`, and `traceContext`. `executionIssues` is a compatible optional
addition: objects written before it read as an empty list, and older readers
ignore it. It freezes the transcript and normalized message schemas with
message dates as ISO strings, importing no live schema. Its compile-time JSON
constraint rejects non-JSON fields. `serialization.ts` owns the typed
`toStoredTranscriptV1` / `fromStoredTranscriptV1` adapters between the live
transcript and V1. `storage-schema.ts` only probes the version before validation
against a supported envelope schema.

Live schema changes do not change V1. When the adapters stop compiling or the
fixture round trip fails, decide: a compatible optional field may be added to V1
if absent values are safe for old readers; anything else starts `versions/v2.ts`
with its own adapters and a read dispatch on the envelope's `schemaVersion`.
Historical versions never import changing current schemas. Deploy readers
accepting both versions before enabling new writers; a reader that meets an
unknown version throws `UnsupportedTraceBatchInputVersionError`, which callers
must treat as retryable. Retries can resolve temporary deployment skew once a
compatible reader is available. Retain old-version readers until old objects
have expired; no rewrite of existing objects is required. Schema versions and
trace-readiness revisions are independent.

The serialization suite round-trips the live transcript fixtures through V1.
The storage suite retains a literal V1 JSON fixture to pin the saved format:

```bash
pnpm --filter @langfuse/shared run test src/server/traceBatch
```
