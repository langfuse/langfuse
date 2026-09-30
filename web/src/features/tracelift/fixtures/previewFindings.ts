import { type TraceliftFinding } from "../types";

/** Sample findings with illustrative ingestion costs, independent of billing data. */
export function createTraceliftPreviewFindings(): TraceliftFinding[] {
  const findings: TraceliftFinding[] = [
    {
      id: "wrapper-spans",
      title: "Unnecessary wrapper spans",
      description:
        "These spans may wrap other work without adding context. Review their inputs, outputs, and children before simplifying the instrumentation.",
      issueCount: 1,
      langfuseIngestionCostUsd: 0.0001,
      observationIds: ["tracelift-support-obs-4"],
      observationNames: ["load-context"],
      prompt:
        "Review the instrumentation around load-context for potentially unnecessary wrapper spans. This is a sample ingestion improvement finding, not a confirmed issue. Inspect example observations and their children, then locate the instrumentation in the codebase. Explain what context each wrapper adds. If a wrapper is redundant, propose a scoped change that preserves useful inputs, outputs, timing, and error context. Keep the application's behavior unchanged and describe how to verify the resulting trace.",
    },
    {
      id: "repeated-generations",
      title: "Repeated generation calls",
      description:
        "Check whether similar requests are intentional agent turns or avoidable duplicates before changing retries or caching.",
      issueCount: 3,
      langfuseIngestionCostUsd: 0.0003,
      observationIds: [
        "tracelift-support-obs-8",
        "tracelift-support-obs-10",
        "tracelift-support-obs-12",
      ],
      observationNames: ["llm.chat"],
      prompt:
        "Investigate repeated llm.chat observations. This is a sample ingestion improvement finding, not a confirmed issue. Compare inputs, outputs, parent spans, and timing to distinguish intentional agent turns or retries from duplicate work. Locate the calling code and explain the cause. If work is duplicated, propose the smallest safe fix and a test that preserves intentional retries and distinct requests. Do not assume matching observation names mean matching requests.",
    },
    {
      id: "repeated-tools",
      title: "Repeated tool spans",
      description:
        "Check whether these spans record separate attempts or the same tool call more than once.",
      issueCount: 1,
      langfuseIngestionCostUsd: 0.0001,
      observationIds: ["tracelift-support-obs-11"],
      observationNames: ["stripe.create-refund"],
      prompt:
        "Review repeated stripe.create-refund spans for duplicate instrumentation. This is a sample ingestion improvement finding, not a confirmed issue. Inspect their parent-child relationships, timing, inputs, and outputs to distinguish separately executed attempts from one call recorded twice. Find the instrumentation responsible and propose a focused correction only when duplicate recording is confirmed. Preserve real retry attempts and their error details. Do not execute tools or change application behavior as part of this instrumentation review.",
    },
  ];

  return findings.map((finding) => ({
    ...finding,
    prompt: [
      finding.prompt,
      "",
      "Sample evidence from the last 30 days:",
      `Issue count: ${finding.issueCount}`,
      `Combined Langfuse ingestion cost (USD, illustrative): ${finding.langfuseIngestionCostUsd}`,
      `Observation IDs: ${finding.observationIds.join(", ")}`,
    ].join("\n"),
  }));
}
