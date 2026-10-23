import { fn } from "storybook/test";
import preview from "../../../.storybook/preview";
import { type RouterOutputs } from "@/src/utils/api";
import { TopicRunDetails } from "./TopicRunDetails";

type Run = RouterOutputs["topics"]["execution"];
type FacetProgress = Run["facets"][number];

const facets = [
  { id: "intent", name: "Intent" },
  { id: "sentiment", name: "Sentiment" },
  { id: "outcome", name: "Outcome" },
  { id: "issues", name: "Issues" },
];
const facetRefs = facets.map((facet) => ({ facetId: facet.id, version: 1 }));

function facetProgress(
  facetId: string,
  overrides: Partial<Omit<FacetProgress, "counts">> & {
    counts?: Partial<FacetProgress["counts"]>;
  } = {},
): FacetProgress {
  const { counts, ...rest } = overrides;
  return {
    facetId,
    facetVersion: 1,
    outcome: "published",
    runId: `run-${facetId}`,
    error: null,
    ...rest,
    counts: {
      requested: 500,
      complete: 500,
      nonApplicable: 0,
      insufficientInput: 0,
      failed: 0,
      assigned: 480,
      outlier: 20,
      ...counts,
    },
  };
}

function processRun(overrides: Partial<Run>): Run {
  return {
    id: "run-process",
    projectId: "project",
    status: "completed",
    phase: "completed",
    createdAt: "2026-10-23T09:12:00Z",
    updatedAt: "2026-10-23T09:40:00Z",
    error: null,
    estimatedCost: 1.84,
    facets: facetRefs.map(({ facetId }) => facetProgress(facetId)),
    input: {
      operation: "process",
      projectId: "project",
      requestId: "request-process",
      facets: facetRefs,
      embeddingConfig: { embeddingDimensions: 1024 },
      reuseExistingSummaries: false,
      processingConfig: { maxInputTokens: 120_000, maxOutputTokens: 512 },
    },
    ...overrides,
  };
}

const traceErrorsClosed = {
  open: false,
  onOpenChange: fn(),
  isPending: false,
};

const retryIdle = { isPending: false, onRetry: fn() };

const updateRun: Run = {
  id: "run-update",
  projectId: "project",
  status: "completed_with_errors",
  phase: "assigning",
  createdAt: "2026-10-22T17:05:00Z",
  updatedAt: "2026-10-22T17:48:00Z",
  error: null,
  estimatedCost: 0,
  facets: [
    facetProgress("intent", {
      counts: {
        requested: 1_240,
        complete: 1_240,
        assigned: 1_193,
        outlier: 47,
      },
    }),
    facetProgress("sentiment", {
      outcome: "awaiting_topics",
      runId: null,
      counts: {
        requested: 1_240,
        complete: 1_240,
        assigned: 0,
        outlier: 0,
      },
    }),
    facetProgress("outcome", {
      outcome: "insufficient_data",
      runId: null,
      counts: {
        requested: 64,
        complete: 64,
        insufficientInput: 12,
        assigned: 0,
        outlier: 0,
      },
    }),
    facetProgress("issues", {
      outcome: "no_topics",
      runId: null,
      counts: {
        requested: 1_240,
        complete: 1_240,
        nonApplicable: 900,
        assigned: 0,
        outlier: 0,
      },
    }),
  ],
  input: {
    operation: "update",
    projectId: "project",
    requestId: "request-update",
    facets: facetRefs,
    embeddingConfig: { embeddingDimensions: 1024 },
    timeRange: {
      from: new Date("2026-09-23T00:00:00Z"),
      to: new Date("2026-10-23T00:00:00Z"),
    },
    exploratory: false,
    minimumTraceCount: 100,
  },
};

const meta = preview.meta({
  component: TopicRunDetails,
  args: {
    facets,
    projectId: "project",
    canWrite: true,
    onRefresh: fn(),
  },
});

export const Running = meta.story({
  args: {
    execution: processRun({
      status: "running",
      phase: "summarizing",
      facets: facetRefs.map(({ facetId }) =>
        facetProgress(facetId, {
          outcome: "pending",
          runId: null,
          counts: { complete: 180, assigned: 0, outlier: 0 },
        }),
      ),
    }),
    traceErrors: traceErrorsClosed,
    retry: retryIdle,
  },
});

export const CompletedUpdate = meta.story({
  args: {
    execution: updateRun,
    traceErrors: traceErrorsClosed,
    retry: retryIdle,
  },
});

export const FailedWithTraceErrors = meta.story({
  args: {
    execution: processRun({
      id: "run-failed",
      status: "failed",
      phase: "summarizing",
      error: "Summary model returned 429 Too Many Requests for 3 batches.",
      estimatedCost: 0.62,
      facets: facetRefs.map(({ facetId }) =>
        facetProgress(facetId, {
          outcome: "failed",
          runId: null,
          error: "Batch 2 of 5 could not be summarized.",
          counts: { complete: 310, failed: 190, assigned: 0, outlier: 0 },
        }),
      ),
    }),
    traceErrors: {
      open: true,
      onOpenChange: fn(),
      isPending: false,
      data: {
        expired: false,
        errors: [
          {
            traceId: "7f3a9c2e1b8d4f6a",
            error: "Input exceeds 120,000 tokens after truncation.",
          },
          {
            traceId: "c41d8e7a9b2f3056",
            error: "Summary model returned 429 Too Many Requests.",
          },
          {
            traceId: "e92b7f1c3d5a8604",
            error: "Trace has no observations with text content.",
          },
        ],
      },
    },
    retry: retryIdle,
  },
});

export const ExpiredTraceErrors = meta.story({
  args: {
    execution: processRun({
      id: "run-expired",
      status: "completed_with_errors",
      phase: "completed",
      createdAt: "2026-09-02T09:12:00Z",
      updatedAt: "2026-09-02T09:55:00Z",
      estimatedCost: 2.31,
      facets: facetRefs.map(({ facetId }) =>
        facetProgress(facetId, {
          counts: { complete: 488, failed: 12, assigned: 470, outlier: 18 },
        }),
      ),
    }),
    traceErrors: {
      open: true,
      onOpenChange: fn(),
      isPending: false,
      data: { expired: true, errors: [] },
    },
    retry: retryIdle,
  },
});
