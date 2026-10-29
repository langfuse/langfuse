# Diagnosis discipline for a reported failure

Corroborated in: claude-code, codex, opencode, pi.

## Rules

- Reproduce and re-measure the report's premise — the exact path, the exact host flag, the exact timing, the exact host version — before writing the fix, and state the correction in the PR.
- For any timestamp, cost or ingestion anomaly, pin the Langfuse server and ClickHouse versions and reproduce against the API or database directly before attributing it to the integration.
- State which parts of the reported symptom your reproduction does and does not explain rather than closing the issue as fully diagnosed.
- Measure a sub-case's share in real traces before declaring it out of scope; do not reason about it from first principles.
- Justify every defensive content guard with a count from the real local corpus, and never let a filter run on the content while a metadata count reads the unfiltered list.
- When assessing an over-export or naming bug, check the downstream Langfuse features that select on it (evaluators filtering isRootObservation, dashboards grouping by name, cost aggregates), not just storage volume.
- Verify a proposed usage or cost key rename against the running Langfuse version's own aggregation code and cite the version measured.
- Validate any boundary marker or ordinal against the entire local corpus across host versions before trusting it, and prefer a semantic key (ids) over a positional ordinal.
- When one integration fixes a rendering or accounting contract, open the matching issue in the sibling integration repos in the same pass.
