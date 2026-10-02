import { type ScoreDomain } from "@langfuse/shared";

/**
 * Selects the corrections to display for one observation in the trace view.
 *
 * Besides the observation's own corrections (matching `observationId`), this
 * includes trace-level corrections (no `observationId`) when the observation
 * owns the trace's trace-level scores — i.e. it is the trace's structural
 * root, whose I/O is the trace's I/O.
 *
 * Without this, a correction created with only a `traceId` (as the
 * corrections docs describe) is ingested but never displayed once an
 * observation is selected, because observation-scoped consumers otherwise
 * only match on `observationId`.
 * See https://github.com/langfuse/langfuse/issues/18014.
 *
 * @param corrections - All corrections for the trace
 * @param observationId - The observation being viewed
 * @param ownsTraceLevelScores - Whether this observation owns the trace's
 *   trace-level scores (structural root; see `traceLevelScoreOwnerIds`)
 * @returns The corrections eligible for display for the observation
 */
export function getCorrectionsForObservation(
  corrections: ScoreDomain[],
  observationId: string,
  ownsTraceLevelScores: boolean,
): ScoreDomain[] {
  return corrections.filter(
    (c) =>
      c.observationId === observationId ||
      (!c.observationId && ownsTraceLevelScores),
  );
}
