import { expect, fn, userEvent, within } from "storybook/test";
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
    estimatedCost: 1.62,
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

const doneWithIssues: Run = {
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

const failedRun = processRun({
  id: "run-failed",
  status: "failed",
  phase: "summarizing",
  error: "Summary model returned 429 Too Many Requests for 3 batches.",
  estimatedCost: 0.62,
  facets: facetRefs.map(({ facetId }) =>
    facetProgress(facetId, {
      outcome: "failed",
      runId: null,
      error: "Summary model returned 429 Too Many Requests for 3 batches.",
      counts: { complete: 310, failed: 3, assigned: 0, outlier: 0 },
    }),
  ),
});

const failedTraceErrors = {
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
};

const meta = preview.meta({
  component: TopicRunDetails,
  args: {
    facets,
    projectId: "project",
    canWrite: true,
    onBack: fn(),
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

export const Regenerating = meta.story({
  name: "(Test) Regenerating counts the summaries it groups",
  args: {
    execution: {
      ...doneWithIssues,
      status: "running",
      phase: "clustering",
      facets: [
        facetProgress("intent", {
          counts: { requested: 1_240, complete: 1_240, assigned: 1_193 },
        }),
        facetProgress("sentiment", {
          outcome: "pending",
          counts: { requested: 1_240, complete: 1_180, assigned: 0 },
        }),
        facetProgress("outcome", {
          outcome: "pending",
          counts: { requested: 0, complete: 0, assigned: 0, outlier: 0 },
        }),
      ],
    },
    traceErrors: traceErrorsClosed,
    retry: retryIdle,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Clustering summaries")).toBeVisible();
    await expect(
      canvas.getByText("1,193 in topics · 20 didn’t fit a topic"),
    ).toBeVisible();
    await expect(
      canvas.getByText("Grouping 1,180 summaries into topics"),
    ).toBeVisible();
    await expect(canvas.queryByText(/summarized/)).toBeNull();
  },
});

export const DoneWithIssues = meta.story({
  args: {
    execution: doneWithIssues,
    traceErrors: traceErrorsClosed,
    retry: retryIdle,
  },
});

export const Failed = meta.story({
  args: {
    execution: failedRun,
    traceErrors: failedTraceErrors,
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

export const Complete = meta.story({
  args: {
    execution: processRun({
      facets: facetRefs.map(({ facetId }) =>
        facetProgress(facetId, {
          counts: { complete: 488, failed: 12, assigned: 470, outlier: 18 },
        }),
      ),
    }),
    traceErrors: traceErrorsClosed,
    retry: retryIdle,
  },
});

export const FailedRunResumes = meta.story({
  name: "(Test) Failed run shows the error once and resumes",
  args: {
    execution: failedRun,
    traceErrors: failedTraceErrors,
    retry: retryIdle,
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const banner = canvas.getByRole("alert");
    await expect(banner).toHaveTextContent("Run stopped");
    await expect(banner).toHaveTextContent(
      "Summary model returned 429 Too Many Requests for 3 batches.",
    );
    await expect(banner).toHaveTextContent(
      "310 traces are already summarized and will be kept.",
    );
    await expect(
      canvas.getAllByText(
        "Summary model returned 429 Too Many Requests for 3 batches.",
      ),
    ).toHaveLength(1);
    await expect(
      canvas.getAllByText("310 of 500 summarized · 190 left"),
    ).toHaveLength(4);
    await expect(canvas.getAllByText("Stopped")).toHaveLength(4);
    await expect(
      canvas.getByText("Summarized before it stopped"),
    ).toBeVisible();
    await expect(canvas.getByText("Est. cost")).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "7f3a9c2e1b8d4f6a" }),
    ).toHaveAttribute("href", "/project/project/traces/7f3a9c2e1b8d4f6a");
    await userEvent.click(canvas.getByRole("button", { name: "Resume run" }));
    await expect(args.retry.onRetry).toHaveBeenCalledOnce();
    await userEvent.click(canvas.getByRole("button", { name: "All runs" }));
    await expect(args.onBack).toHaveBeenCalledOnce();
  },
});

export const QuestionStatusesExplainThemselves = meta.story({
  name: "(Test) Done with issues maps question outcomes and notes",
  args: {
    execution: doneWithIssues,
    traceErrors: traceErrorsClosed,
    retry: retryIdle,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("alert")).toBeNull();
    await expect(canvas.queryByText("Est. cost")).toBeNull();
    await expect(canvas.getByText("Done with issues")).toBeVisible();
    await expect(
      canvas.getByText("1,193 in topics · 47 didn’t fit a topic"),
    ).toBeVisible();
    await expect(canvas.getByText("Waiting")).toBeVisible();
    await expect(canvas.getByText("Needs more traces")).toBeVisible();
    await expect(
      canvas.getByText("64 summaries · 12 had too little text"),
    ).toBeVisible();
    await expect(
      canvas.getByText(
        "Grouping needs at least 100 summaries. Run on more traces, or lower the minimum.",
      ),
    ).toBeVisible();
    await expect(canvas.getByText("No topics found")).toBeVisible();
    await expect(
      canvas.getByText(
        "The other 340 didn’t form clear groups. Try a larger, more varied set of traces.",
      ),
    ).toBeVisible();
  },
});
