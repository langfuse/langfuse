import { useState, type ComponentProps } from "react";
import { type FilterState } from "@langfuse/shared";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { Button } from "@/src/components/design-system/Button/Button";
import { ScatterTopicsView } from "./ScatterTopicsView";
import { fitCamera, prepareTopicMap, screenPoint } from "./prepare-topic-map";
import { staticTopicTraces, storyFacet } from "../topic-story-traces";

const topics = [
  {
    id: "billing",
    versionId: "billing-v1",
    runId: "run-1",
    name: "Billing questions",
    description: "Invoices, refunds, and subscription changes.",
    count: 2,
  },
  {
    id: "access",
    versionId: "access-v1",
    runId: "run-1",
    name: "Account access",
    description: "Sign-in and workspace recovery.",
    count: 1,
  },
];

const rows = [
  {
    traceId: "trace-billing-1",
    summary: "Customer requests an invoice copy for October.",
    topicId: "billing",
    topicName: "Billing questions",
    outcome: "assigned" as const,
    facetVersion: 1,
    unitStartTime: "2026-10-20T12:00:00.000Z",
  },
  {
    traceId: "trace-billing-2",
    summary: "Customer asks to switch their subscription to annual billing.",
    topicId: "billing",
    topicName: "Billing questions",
    outcome: "assigned" as const,
    facetVersion: 1,
    unitStartTime: "2026-10-20T11:00:00.000Z",
  },
  {
    traceId: "trace-access-1",
    summary: "User needs to recover access after changing their email.",
    topicId: "access",
    topicName: "Account access",
    outcome: "assigned" as const,
    facetVersion: 1,
    unitStartTime: "2026-10-20T10:00:00.000Z",
  },
];

const facet = storyFacet(
  {
    facetId: "intent",
    name: "Intent",
    facetVersion: 1,
    topics,
    map: { runId: "run-1", topics },
  },
  rows,
);

const mapPoints = [
  { ...rows[0], x: -12, y: 0 },
  { ...rows[1], x: 12, y: 0 },
  { ...rows[2], x: 0, y: 12 },
];

const mapResult: ComponentProps<typeof ScatterTopicsView>["mapResult"] = {
  error: null,
  data: {
    status: "ready",
    reason: null,
    missingSummaryCount: 0,
    unpositionedCount: 0,
    points: mapPoints,
  },
};

function ScatterExample(
  args: ComponentProps<typeof ScatterTopicsView> & {
    onPeekChange?: (traceId: string | null) => void;
  },
) {
  const [filters, setFilters] = useState<FilterState>(
    args.traceFilters.filters,
  );
  const [searchQuery, setSearchQuery] = useState<string | null>(
    args.traceFilters.searchQuery,
  );
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(
    args.selectedTraceId,
  );
  const [localPeekId, setLocalPeekId] = useState<string | null>(
    args.peekTraceId ?? null,
  );
  const peekTraceId = args.onPeekChange ? args.peekTraceId : localPeekId;
  const setPeekTraceId = args.onPeekChange ?? setLocalPeekId;
  return (
    <div className="flex h-[720px] w-[1280px] flex-col p-2">
      <ScatterTopicsView
        {...args}
        traceFilters={{
          ...args.traceFilters,
          filters,
          searchQuery,
          setFilters,
          setSearchQuery,
        }}
        selectedTraceId={selectedTraceId}
        onSelectTrace={(traceId) => {
          setSelectedTraceId(traceId);
          args.onSelectTrace(traceId);
        }}
        peekTraceId={peekTraceId}
        peekView={{
          ...args.peekView,
          openPeek: (...callArgs) => {
            setPeekTraceId(callArgs[0] ?? null);
            args.peekView.openPeek?.(...callArgs);
          },
          closePeek: () => {
            setPeekTraceId(null);
            args.peekView.closePeek();
          },
        }}
      />
    </div>
  );
}

const defaultArgs: ComponentProps<typeof ScatterTopicsView> = {
  projectId: "storybook-topics",
  facet,
  mapResult,
  traceFilters: {
    selectedFacetId: "intent",
    selectFacet: fn(),
    filters: [],
    searchQuery: null,
    setFilters: fn(),
    setSearchQuery: fn(),
  },
  showUnassigned: true,
  peekView: {
    itemType: "TRACE",
    tableName: "topics-traces",
    isV4: true,
    openPeek: fn(),
    closePeek: fn(),
  },
  peekTraceId: null,
  selectedTraceId: null,
  onSelectTrace: fn(),
  useTraces: staticTopicTraces(rows, 2),
};

const meta = preview.meta({
  component: ScatterTopicsView,
  parameters: { layout: "fullscreen" },
  args: defaultArgs,
  render: (args) => <ScatterExample {...args} />,
});

export const Default = meta.story({});

function clickTracePoint(
  stage: HTMLElement,
  traceId: string,
  points: typeof mapPoints,
) {
  const model = prepareTopicMap(
    { points, missingSummaryCount: 0, unpositionedCount: 0 },
    topics,
  );
  const point = model.pointById.get(traceId);
  if (!point) throw new Error(`Missing map point ${traceId}`);
  const rect = stage.getBoundingClientRect();
  const plot = { width: rect.width, height: rect.height };
  const initial = fitCamera(model.bounds, model.bounds, plot);
  const position = screenPoint(point, initial, model.bounds, plot);
  stage.dispatchEvent(
    new MouseEvent("click", {
      bubbles: true,
      clientX: rect.left + position.x,
      clientY: rect.top + position.y,
    }),
  );
}

export const DotClickHighlightsWithoutOpeningPeek = meta.story({
  name: "(Test) Dot clicks highlight traces in the list and only row clicks open peek",
  render: function InteractiveScatter(args) {
    const [peekTraceId, setPeekTraceId] = useState<string | null>(null);
    return (
      <>
        <div className="flex gap-2 p-2">
          <Button
            text="Close peek"
            variant="secondary"
            size="sm"
            onClick={() => setPeekTraceId(null)}
          />
          <Button
            text="Reopen peek billing-2"
            variant="secondary"
            size="sm"
            onClick={() => setPeekTraceId("trace-billing-2")}
          />
        </div>
        <ScatterExample
          {...args}
          peekTraceId={peekTraceId}
          onPeekChange={setPeekTraceId}
        />
      </>
    );
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const stage = await canvas.findByRole("group", {
      name: /^Interactive scatter/,
    });
    // The list remounts per topic selection, so look it up fresh each time.
    const traceList = () =>
      within(canvas.getByRole("region", { name: "Topic traces" }));
    await traceList().findByText("trace-billing-1");
    await waitFor(() =>
      expect(stage.getBoundingClientRect().height).toBeGreaterThan(0),
    );
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );

    // Clicking a loaded scatter dot highlights its row without opening peek.
    clickTracePoint(stage, "trace-billing-1", mapPoints);
    await waitFor(() =>
      expect(
        traceList().getByText("trace-billing-1").closest("tr"),
      ).toHaveAttribute("aria-selected", "true"),
    );
    await expect(args.peekView.openPeek).not.toHaveBeenCalled();

    // Clicking a dot outside the first loaded page pins and highlights its row without opening peek.
    clickTracePoint(stage, "trace-access-1", mapPoints);
    const pinnedCell = await traceList().findByText("trace-access-1");
    await waitFor(() =>
      expect(pinnedCell.closest("tr")).toHaveAttribute("aria-selected", "true"),
    );
    await expect(args.peekView.openPeek).not.toHaveBeenCalled();

    // Clicking a trace row in the table opens the peek drawer and clears the scatter highlight.
    await userEvent.click(traceList().getByText("trace-billing-2"));
    await expect(args.peekView.openPeek).toHaveBeenCalledWith(
      "trace-billing-2",
      expect.objectContaining({ traceId: "trace-billing-2" }),
    );
    await waitFor(() =>
      expect(traceList().queryByText("trace-access-1")).not.toBeInTheDocument(),
    );

    // Clicking a dot while a peek is still closing takes over the map immediately;
    // once closed, reopening a peek (e.g. via Back/Forward) takes back map and list selection.
    clickTracePoint(stage, "trace-billing-1", mapPoints);
    await waitFor(() => {
      const tooltip = canvasElement.querySelector<HTMLElement>(
        '[role="tooltip"][data-active="true"]',
      );
      expect(tooltip).toHaveAttribute("data-trace-id", "trace-billing-1");
    });
    await expect(
      traceList().getByText("trace-billing-1").closest("tr"),
    ).toHaveAttribute("aria-selected", "true");
    await userEvent.click(canvas.getByRole("button", { name: "Close peek" }));
    await userEvent.click(
      canvas.getByRole("button", { name: "Reopen peek billing-2" }),
    );
    await waitFor(() => {
      const tooltip = canvasElement.querySelector<HTMLElement>(
        '[role="tooltip"][data-active="true"]',
      );
      expect(tooltip).toHaveAttribute("data-trace-id", "trace-billing-2");
    });
    await expect(
      traceList().getByText("trace-billing-1").closest("tr"),
    ).not.toHaveAttribute("aria-selected", "true");
    await userEvent.click(canvas.getByRole("button", { name: "Close peek" }));

    // Picking a topic and highlighting a dot: first empty click clears the trace, second clears the topic.
    await userEvent.click(
      canvas.getByRole("button", { name: /Billing questions/ }),
    );
    await waitFor(() =>
      expect(
        traceList().getByRole("heading", { name: "Billing questions" }),
      ).toBeVisible(),
    );
    clickTracePoint(stage, "trace-billing-1", mapPoints);
    await waitFor(() =>
      expect(
        traceList().getByText("trace-billing-1").closest("tr"),
      ).toHaveAttribute("aria-selected", "true"),
    );

    const rect = stage.getBoundingClientRect();
    const clickEmpty = () =>
      stage.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          clientX: rect.left + 8,
          clientY: rect.top + 8,
        }),
      );
    clickEmpty();
    await waitFor(() =>
      expect(
        traceList().getByText("trace-billing-1").closest("tr"),
      ).not.toHaveAttribute("aria-selected", "true"),
    );
    await expect(
      traceList().getByRole("heading", { name: "Billing questions" }),
    ).toBeVisible();

    clickEmpty();
    await waitFor(() =>
      expect(
        traceList().getByRole("heading", { name: "All traces" }),
      ).toBeVisible(),
    );
  },
});
