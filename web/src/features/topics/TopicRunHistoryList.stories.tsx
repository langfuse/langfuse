import { fn } from "storybook/test";
import preview from "../../../.storybook/preview";
import { type RouterOutputs } from "@/src/utils/api";
import { TopicRunHistoryList } from "./TopicRunHistoryList";

type Run = RouterOutputs["topics"]["executions"][number];

const facetRefs = [
  { facetId: "intent", version: 1 },
  { facetId: "sentiment", version: 1 },
  { facetId: "outcome", version: 2 },
];

function facetProgress(
  facetId: string,
  version: number,
): Run["facets"][number] {
  return {
    facetId,
    facetVersion: version,
    outcome: "published",
    runId: `run-${facetId}`,
    error: null,
    counts: {
      requested: 500,
      complete: 500,
      nonApplicable: 0,
      insufficientInput: 0,
      failed: 0,
      assigned: 480,
      outlier: 20,
    },
  };
}

function processRun(
  id: string,
  status: Run["status"],
  createdAt: string,
  estimatedCost: number,
): Run {
  return {
    id,
    projectId: "project",
    status,
    phase: status === "running" ? "summarizing" : status,
    createdAt,
    updatedAt: createdAt,
    error: null,
    estimatedCost,
    facets: facetRefs.map(({ facetId, version }) =>
      facetProgress(facetId, version),
    ),
    input: {
      operation: "process",
      projectId: "project",
      requestId: `request-${id}`,
      facets: facetRefs,
      embeddingConfig: { embeddingDimensions: 1024 },
      reuseExistingSummaries: false,
      processingConfig: { maxInputTokens: 120_000, maxOutputTokens: 512 },
    },
  };
}

function updateRun(id: string, status: Run["status"], createdAt: string): Run {
  return {
    id,
    projectId: "project",
    status,
    phase: status === "queued" ? "queued" : "clustering",
    createdAt,
    updatedAt: createdAt,
    error: null,
    estimatedCost: 0,
    facets: facetRefs
      .slice(0, 2)
      .map(({ facetId, version }) => facetProgress(facetId, version)),
    input: {
      operation: "update",
      projectId: "project",
      requestId: `request-${id}`,
      facets: facetRefs.slice(0, 2),
      embeddingConfig: { embeddingDimensions: 1024 },
      timeRange: {
        from: new Date("2026-09-23T00:00:00Z"),
        to: new Date("2026-10-23T00:00:00Z"),
      },
      exploratory: false,
    },
  };
}

const runs: Run[] = [
  processRun("run-6", "running", "2026-10-23T09:12:00Z", 1.84),
  updateRun("run-5", "queued", "2026-10-23T08:40:00Z"),
  processRun("run-4", "completed", "2026-10-22T17:05:00Z", 4.2),
  processRun("run-3", "completed_with_errors", "2026-10-21T11:30:00Z", 3.95),
  updateRun("run-2", "failed", "2026-10-20T15:00:00Z"),
  processRun("run-1", "completed", "2026-10-19T09:00:00Z", 0.97),
];

const meta = preview.meta({
  component: TopicRunHistoryList,
  args: {
    onOpen: fn(),
    onRefresh: fn(),
  },
});

export const Default = meta.story({
  args: { executions: runs },
});

export const Empty = meta.story({
  args: { executions: [] },
});

export const Error = meta.story({
  args: {
    executions: [],
    errorMessage: "Topics progress requires Redis.",
  },
});
