import { expect, fn, userEvent, within } from "storybook/test";
import { format, setHours, startOfDay, subDays } from "date-fns";
import preview from "../../../.storybook/preview";
import { type RouterOutputs } from "@/src/utils/api";
import { TopicRunHistoryList } from "./TopicRunHistoryList";

type Run = RouterOutputs["topics"]["executions"][number];
type Counts = Partial<Run["facets"][number]["counts"]>;

const facetRefs = [
  { facetId: "intent", version: 1 },
  { facetId: "sentiment", version: 1 },
  { facetId: "outcome", version: 2 },
];

const hoursAgo = (hours: number) =>
  new Date(Date.now() - hours * 3_600_000).toISOString();
const atDaysAgo = (days: number, hour: number) =>
  setHours(subDays(startOfDay(new Date()), days), hour).toISOString();
const dayLabel = (days: number) => {
  const date = subDays(startOfDay(new Date()), days);
  return format(
    date,
    date.getFullYear() === new Date().getFullYear() ? "MMM d" : "MMM d, yyyy",
  );
};

function facetProgress(
  facetId: string,
  version: number,
  counts: Counts,
  error: string | null = null,
): Run["facets"][number] {
  const requested = counts.requested ?? 500;
  return {
    facetId,
    facetVersion: version,
    outcome: error ? "failed" : "published",
    runId: `run-${facetId}`,
    error,
    counts: {
      requested,
      complete: requested,
      nonApplicable: 0,
      insufficientInput: 0,
      failed: 0,
      assigned: requested - 20,
      outlier: 20,
      ...counts,
    },
  };
}

function processRun(
  id: string,
  status: Run["status"],
  createdAt: string,
  estimatedCost: number,
  counts: Counts = {},
  error: string | null = null,
): Run {
  return {
    id,
    projectId: "project",
    status,
    phase: status === "running" ? "summarizing" : status,
    createdAt,
    updatedAt: createdAt,
    error,
    estimatedCost,
    facets: facetRefs.map(({ facetId, version }) =>
      facetProgress(facetId, version, counts),
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

function updateRun(
  id: string,
  status: Run["status"],
  createdAt: string,
  error: string | null = null,
): Run {
  return {
    id,
    projectId: "project",
    status,
    phase: status === "queued" ? "queued" : "clustering",
    createdAt,
    updatedAt: createdAt,
    error,
    estimatedCost: 0,
    facets: facetRefs
      .slice(0, 2)
      .map(({ facetId, version }) =>
        facetProgress(facetId, version, { requested: 1_200 }),
      ),
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
  processRun("run-9", "running", hoursAgo(0.4), 1.84, {
    requested: 1_280,
    complete: 640,
  }),
  updateRun("run-8", "queued", hoursAgo(0.3)),
  processRun("run-7", "completed", hoursAgo(17), 4.2, { requested: 1_412 }),
  processRun("run-6", "completed_with_errors", hoursAgo(46), 3.95, {
    requested: 1_330,
    complete: 1_318,
    failed: 12,
  }),
  updateRun("run-5", "failed", hoursAgo(67), "Embedding model returned 429."),
  processRun("run-4", "completed", hoursAgo(97), 0.97, { requested: 326 }),
  updateRun("run-3", "completed", hoursAgo(98)),
  processRun("run-2", "completed", hoursAgo(118), 3.3, {
    requested: 1_105,
  }),
  processRun("run-1", "completed", hoursAgo(148), 2.9, { requested: 980 }),
  updateRun("run-0", "completed", hoursAgo(152)),
];

const meta = preview.meta({
  component: TopicRunHistoryList,
  args: {
    onOpen: fn(),
    onRetry: fn(),
  },
});

export const Default = meta.story({
  args: { executions: runs },
});

export const Empty = meta.story({
  args: { executions: [] },
});

export const LoadError = meta.story({
  args: {
    executions: [],
    errorMessage: "Request timed out.",
  },
});

export const PinsRunningAndGroupsByDay = meta.story({
  name: "(Test) Pins the running run and groups past runs by day",
  args: {
    executions: [
      updateRun("regenerate-done", "completed", atDaysAgo(4, 10)),
      processRun("analyze-running", "running", atDaysAgo(0, 9), 1.84, {
        requested: 1_280,
        complete: 640,
      }),
      processRun("analyze-done", "completed", atDaysAgo(1, 10), 4.2, {
        requested: 1_412,
      }),
      processRun(
        "analyze-issues",
        "completed_with_errors",
        atDaysAgo(2, 10),
        3.95,
        { requested: 1_330, complete: 1_318, failed: 12 },
      ),
      updateRun(
        "regenerate-failed",
        "failed",
        atDaysAgo(3, 10),
        "Embedding model returned 429.",
      ),
    ],
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const active = canvas.getByRole("status");
    await expect(active).toHaveTextContent("Analyze traces");
    await expect(active).toHaveTextContent("640 / 1,280");
    await expect(
      within(active).getByRole("img", { name: "Running" }),
    ).toBeVisible();

    await expect(
      canvas.getAllByRole("heading", { level: 3 }).map((h) => h.textContent),
    ).toEqual(["Yesterday", dayLabel(2), dayLabel(3), dayLabel(4)]);

    await userEvent.click(
      within(active).getByRole("button", { name: /Analyze traces/ }),
    );
    await expect(args.onOpen).toHaveBeenCalledWith("analyze-running");

    const rows = canvas
      .getAllByRole("button")
      .filter((row) => !active.contains(row));
    await expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Analyze traces1,412 traces · $4.20"),
      expect.stringContaining("Analyze traces12 traces failed"),
      expect.stringContaining("Regenerate topicsEmbedding model returned 429."),
      expect.stringMatching(/Regenerate topicsComplete$/),
    ]);
    await expect(within(rows[1]).getByText("Done with issues")).toBeVisible();
    await expect(within(rows[2]).getByText("Failed")).toBeVisible();

    await userEvent.click(rows[1]);
    await expect(args.onOpen).toHaveBeenCalledWith("analyze-issues");
  },
});

export const ShowsRefetchErrorAboveRuns = meta.story({
  name: "(Test) A refetch error shows above the cached runs",
  args: {
    executions: runs.slice(2, 4),
    errorMessage: "Request timed out.",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "Request timed out.",
    );
    await expect(canvas.getAllByRole("button")).toHaveLength(2);
  },
});

export const RetriesAfterLoadError = meta.story({
  name: "(Test) Load error offers a retry",
  args: {
    executions: [],
    errorMessage: "Request timed out.",
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Couldn’t load run history")).toBeVisible();
    await expect(canvas.getByText("Request timed out.")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Try again" }));
    await expect(args.onRetry).toHaveBeenCalledOnce();
  },
});
