import { TraceIssue } from "@langfuse/shared";
import { createTraceliftFinding } from "../issuePresentation";
import type { TraceliftFinding } from "../types";

/** Illustrative findings using the same categories and presentation as the detector. */
export function createTraceliftPreviewFindings(): TraceliftFinding[] {
  return Object.values(TraceIssue).map((issue, index) =>
    createTraceliftFinding(
      {
        issue,
        count: index + 1,
        examples: [{ traceId: "tracelift-support", observationId: null }],
      },
      {
        projectId: "storybook",
        fromTimestamp: new Date("2026-09-01T00:00:00Z"),
        toTimestamp: new Date("2026-10-01T00:00:00Z"),
      },
    ),
  );
}
