import { useState, type ComponentProps } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { Button } from "@/src/components/design-system/Button/Button";
import { TopicMapExplorer } from "./TopicMapExplorer";
import { fitCamera, prepareTopicMap, screenPoint } from "./prepare-topic-map";

type ExplorerProps = ComponentProps<typeof TopicMapExplorer>;

const data = {
  points: [
    {
      traceId: "trace-billing",
      summary: "Customer asks for a copy of an invoice.",
      unitStartTime: "2026-10-01T00:00:00.000Z",
      topicId: "billing",
      outcome: "assigned",
      x: 0,
      y: 0,
    },
    {
      traceId: "trace-outlier",
      summary: "Customer asks about a new integration.",
      unitStartTime: "2026-10-01T00:00:00.000Z",
      topicId: null,
      outcome: "outlier",
      x: 3,
      y: 1,
    },
  ],
  missingSummaryCount: 0,
  unpositionedCount: 0,
} satisfies ComponentProps<typeof TopicMapExplorer>["data"];

const issueClusters = [
  {
    id: "product-context",
    name: "Stale product context",
    description:
      "Answers rely on older catalog pages instead of current product details.",
    center: [-55, -28],
    count: 36,
    summaries: [
      "The assistant quotes a discontinued product warranty from an archived catalog page.",
      "A comparison uses last season's product specifications after retrieval returns an older document.",
      "The answer recommends an unavailable size because the retrieved stock guide is out of date.",
    ],
  },
  {
    id: "payment-retries",
    name: "Payment retries",
    description:
      "Payment requests repeat after the provider reports an ambiguous result.",
    center: [-52, 23],
    count: 28,
    summaries: [
      "The checkout tool retries a payment after a timeout without checking the original transaction.",
      "A declined payment sends the conversation back to checkout without explaining the provider response.",
      "The assistant repeats the same payment request after the user asks whether the first attempt succeeded.",
    ],
  },
  {
    id: "inventory-timeouts",
    name: "Inventory timeouts",
    description:
      "Stock lookups time out and leave product availability unresolved.",
    center: [-5, -25],
    count: 34,
    summaries: [
      "An inventory lookup times out twice and the assistant cannot confirm whether the item is in stock.",
      "The stock service returns a gateway timeout; the assistant asks the user to repeat the same product request.",
      "A warehouse lookup stalls before returning availability, so the conversation ends without an answer.",
    ],
  },
  {
    id: "account-permissions",
    name: "Account permission failures",
    description:
      "Authenticated order lookups fail because the tool lacks access to the account.",
    center: [4, 28],
    count: 22,
    summaries: [
      "The order lookup returns permission denied after sign-in and the assistant requests another sign-in.",
      "A support tool cannot access the user's account and no alternative verification path is offered.",
      "The assistant treats an access-denied response as a missing order instead of explaining the permission issue.",
    ],
  },
  {
    id: "delivery-loops",
    name: "Delivery status loops",
    description:
      "Repeated tracking calls return the same status without advancing the request.",
    center: [48, -24],
    count: 26,
    summaries: [
      "The assistant calls tracking four times with the same order number and repeats the pending status.",
      "A delivery question loops between address confirmation and a tracking response that never changes.",
      "The user asks for a delivery date, but repeated tracking calls only return label created.",
    ],
  },
  {
    id: "missing-handoffs",
    name: "Missing handoffs",
    description:
      "Requests needing a human end without creating the promised support handoff.",
    center: [57, 27],
    count: 18,
    summaries: [
      "The assistant promises to escalate a damaged-item claim but no support ticket is created.",
      "A refund needs manual approval; the assistant ends the conversation without contacting support.",
      "The user asks for a human, but the handoff tool is never called and the request remains unresolved.",
    ],
  },
] as const;

const denseTopics = issueClusters.map(({ id, name, description }) => ({
  id,
  name,
  description,
}));
const denseData = {
  points: [
    ...issueClusters.flatMap((cluster) =>
      Array.from({ length: cluster.count }, (_, index) => {
        const angle = index * 2.399963229728653;
        const radius = 2 + Math.sqrt((index + 0.5) / cluster.count) * 10;
        return {
          traceId: `demo-${cluster.id}-${index + 1}`,
          summary: `${cluster.summaries[index % cluster.summaries.length]} Request ${index + 1}.`,
          unitStartTime: "2026-10-01T00:00:00.000Z",
          topicId: cluster.id,
          outcome: "assigned" as const,
          x: cluster.center[0] + Math.cos(angle) * radius,
          y: cluster.center[1] + Math.sin(angle) * radius * 0.7,
        };
      }),
    ),
    ...Array.from({ length: 8 }, (_, index) => ({
      traceId: `demo-outlier-${index + 1}`,
      summary:
        "A gift-wrapping request does not match the recurring operational issues.",
      unitStartTime: "2026-10-01T00:00:00.000Z",
      topicId: null,
      outcome: "outlier" as const,
      x: -30 + index * 8,
      y: 2 + Math.sin(index) * 5,
    })),
    ...Array.from({ length: 5 }, (_, index) => ({
      traceId: `demo-unassigned-${index + 1}`,
      summary:
        "An exchange-policy summary has saved coordinates but its topic assignment is unavailable.",
      unitStartTime: "2026-10-01T00:00:00.000Z",
      topicId: null,
      outcome: "unassigned" as const,
      x: 73 + index * 2,
      y: -4 + index * 3,
    })),
  ],
  missingSummaryCount: 0,
  unpositionedCount: 0,
} satisfies ExplorerProps["data"];

const nearbyCloudData = {
  ...denseData,
  points: denseData.points.map((point) =>
    point.topicId === "inventory-timeouts"
      ? { ...point, x: point.x - 40, y: point.y + 5 }
      : point,
  ),
} satisfies ExplorerProps["data"];

function ControlledExplorer(args: ExplorerProps) {
  const [selectedTopic, setSelectedTopic] = useState(args.selectedTopic);
  const [selectedTraceId, setSelectedTraceId] = useState(args.selectedTraceId);
  const handleSelectTopic = (id: string | null) => {
    setSelectedTopic(id);
    setSelectedTraceId(null);
    args.onSelectTopic(id);
  };
  const handleSelectTrace = (id: string | null) => {
    setSelectedTraceId(id);
    args.onSelectTrace(id);
  };
  return (
    <TopicMapExplorer
      {...args}
      selectedTopic={selectedTopic}
      selectedTraceId={selectedTraceId}
      onSelectTopic={handleSelectTopic}
      onSelectTrace={handleSelectTrace}
    />
  );
}

async function waitForMapSettled(canvasElement: HTMLElement) {
  let previous = "";
  let changedAt = performance.now();
  await waitFor(
    () => {
      const current = Array.from(
        canvasElement.querySelectorAll<HTMLElement>(
          "[data-topic-background-label]",
        ),
      )
        .map((element) => element.getAttribute("style"))
        .join(";");
      expect(current).not.toBe("");
      if (current !== previous) {
        previous = current;
        changedAt = performance.now();
      }
      expect(performance.now() - changedAt).toBeGreaterThan(150);
    },
    { timeout: 3000 },
  );
}

const meta = preview.meta({
  component: TopicMapExplorer,
  args: {
    topics: [{ id: "billing", name: "Billing" }],
    data,
    selectedTopic: null,
    selectedTraceId: null,
    onSelectTopic: fn(),
    onSelectTrace: fn(),
  },
});

export const Default = meta.story({});

export const SummaryLengths = meta.story({
  args: {
    data: {
      ...data,
      points: [
        data.points[0],
        {
          ...data.points[1],
          summary:
            "The customer asks how to connect a new integration, configure its authentication credentials, and verify that events arrive in the correct project. The assistant walks through setup, explains how to troubleshoot missing events, and confirms that the connection is working before ending the conversation.",
        },
      ],
    },
  },
});

export const SelectedTopic = meta.story({
  args: { selectedTopic: "billing", selectedTraceId: "trace-billing" },
});

export const Empty = meta.story({
  args: { data: { ...data, points: [] } },
});

export const DenseIssueCloud = meta.story({
  args: {
    topics: denseTopics,
    data: denseData,
  },
  render: (args) => <ControlledExplorer {...args} />,
});

export const OutliersSelected = meta.story({
  args: {
    topics: denseTopics,
    data: denseData,
    selectedTopic: "outliers",
  },
  render: (args) => <ControlledExplorer {...args} />,
});

export const MissingSummaries = meta.story({
  name: "(Test) Missing summaries coverage",
  args: { data: { ...data, missingSummaryCount: 2, unpositionedCount: 3 } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const stage = canvas.getByRole("group", { name: /^Interactive scatter/ });
    const baseline = stage.getBoundingClientRect();
    const trigger = canvas.getByRole("button", { name: /^Map coverage/ });
    expect(getComputedStyle(trigger).pointerEvents).toBe("auto");
    await userEvent.hover(trigger);
    const body = within(canvasElement.ownerDocument.body);
    await waitFor(() => {
      const tooltip = body.getByRole("tooltip");
      expect(getComputedStyle(tooltip).pointerEvents).toBe("none");
      expect(tooltip).toHaveTextContent(
        "2 saved map points have no current summary.",
      );
      expect(tooltip).toHaveTextContent(
        "3 current summaries have no saved coordinates.",
      );
    });
    const after = stage.getBoundingClientRect();
    expect(after.width).toBe(baseline.width);
    expect(after.height).toBe(baseline.height);
    expect(after.top).toBe(baseline.top);
  },
});

export const HoverPreservesMapGeometry = meta.story({
  name: "(Test) Hover Preserves Map Geometry",
  args: {
    fillContainer: true,
    data,
    topics: [
      {
        id: "billing",
        name: "Billing, invoices, subscriptions, and account administration",
      },
    ],
    selectedTopic: null,
    selectedTraceId: null,
    onSelectTrace: fn(),
  },
  render: (args) => (
    <div style={{ height: 680 }}>
      <ControlledExplorer {...args} />
    </div>
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const stage = canvas.getByRole("group", { name: /^Interactive scatter/ });
    await waitFor(() =>
      expect(stage.getBoundingClientRect().height).toBeGreaterThan(0),
    );
    const model = prepareTopicMap(args.data, args.topics);
    const trace = model.pointById.get("trace-billing");
    if (!trace) throw new Error("The hover fixture trace is missing.");
    const baseline = stage.getBoundingClientRect();
    const plot = { width: baseline.width, height: baseline.height };
    const initial = fitCamera(model.bounds, model.bounds, plot);
    const position = screenPoint(trace, initial, model.bounds, plot);
    let attempt = 0;
    await waitFor(
      () => {
        stage.dispatchEvent(
          new PointerEvent("pointermove", {
            bubbles: true,
            pointerId: 1,
            pointerType: "mouse",
            isPrimary: true,
            clientX: baseline.left + position.x + (attempt++ % 2 ? 1 : -1),
            clientY: baseline.top + position.y,
          }),
        );
        const active = canvasElement.querySelectorAll<HTMLElement>(
          '[role="tooltip"][data-active="true"]',
        );
        expect(active).toHaveLength(1);
        expect(active[0]).toHaveAttribute("data-trace-id", trace.traceId);
      },
      { timeout: 3000 },
    );
    const tooltip = canvas.getByRole("tooltip", { name: /^Trace summary:/ });
    await waitFor(() =>
      expect(Number(getComputedStyle(tooltip).opacity)).toBeCloseTo(0.96, 2),
    );
    const topicName = args.topics[0].name;
    await expect(tooltip).toHaveAccessibleName(
      `Trace summary: ${topicName}. ${trace.summary}`,
    );
    const topicLabel = within(tooltip).getByText(topicName);
    await expect(topicLabel).toBeVisible();
    await expect(topicLabel.scrollHeight).toBeLessThanOrEqual(
      topicLabel.clientHeight,
    );
    await expect(getComputedStyle(tooltip).pointerEvents).toBe("none");
    await expect(tooltip).not.toHaveAttribute("tabindex");
    const tooltipBounds = tooltip.getBoundingClientRect();
    const beneath = canvasElement.ownerDocument.elementFromPoint(
      tooltipBounds.left + tooltipBounds.width / 2,
      tooltipBounds.top + tooltipBounds.height / 2,
    );
    await expect(beneath?.closest('[role="tooltip"]')).toBeNull();
    const assertStageBounds = () => {
      const current = stage.getBoundingClientRect();
      expect(current.x).toBeCloseTo(baseline.x, 2);
      expect(current.y).toBeCloseTo(baseline.y, 2);
      expect(current.width).toBeCloseTo(baseline.width, 2);
      expect(current.height).toBeCloseTo(baseline.height, 2);
    };
    assertStageBounds();
    stage.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        clientX: baseline.left + position.x,
        clientY: baseline.top + position.y,
      }),
    );
    await expect(args.onSelectTrace).toHaveBeenLastCalledWith(trace.traceId);
    await waitFor(assertStageBounds);
    stage.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        clientX: baseline.left + baseline.width / 2,
        clientY: baseline.top + baseline.height / 2,
      }),
    );
    await expect(args.onSelectTrace).toHaveBeenLastCalledWith(null);
    await waitFor(assertStageBounds);
    await waitFor(() =>
      expect(canvasElement.querySelectorAll('[role="tooltip"]')).toHaveLength(
        0,
      ),
    );
  },
});

export const InterruptingTopicFlightKeepsPaintedZoom = meta.story({
  name: "(Test) Interrupting Topic Flight Keeps Painted Zoom",
  args: {
    topics: denseTopics,
    data: {
      ...denseData,
      points: [
        {
          traceId: "flight-marker-left",
          summary: "An inventory lookup times out before returning stock.",
          unitStartTime: "2026-10-01T00:00:00.000Z",
          topicId: "inventory-timeouts",
          outcome: "assigned",
          x: -5,
          y: -25,
        },
        {
          traceId: "flight-marker-right",
          summary: "A repeated inventory lookup returns the same timeout.",
          unitStartTime: "2026-10-01T00:00:00.000Z",
          topicId: "inventory-timeouts",
          outcome: "assigned",
          x: -4.75,
          y: -25,
        },
        ...denseData.points,
      ],
    },
    selectedTopic: null,
  },
  render: (args) => <ControlledExplorer {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const stage = canvas.getByRole("group", { name: /^Interactive scatter/ });
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const drawing = stage.querySelector("canvas");
    const context = drawing?.getContext("2d");
    if (!drawing || !context)
      throw new Error("The map canvas context is unavailable.");
    const clearRect = context.clearRect;
    const arc = context.arc;
    const painted = {
      offset: null as number | null,
    };
    context.clearRect = (x, y, width, height) => {
      painted.offset = null;
      clearRect.call(context, x, y, width, height);
    };
    // Culling changes which dots paint; the dot nearest the wheel anchor scales with zoom.
    context.arc = (x, y, radius, start, end, counterclockwise) => {
      const offset = Math.hypot(
        x - drawing.clientWidth / 2,
        y - drawing.clientHeight / 2,
      );
      painted.offset = Math.min(painted.offset ?? offset, offset);
      arc.call(context, x, y, radius, start, end, counterclockwise);
    };
    const wheelAt = (deltaY: number) => {
      const rect = stage.getBoundingClientRect();
      stage.dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          ctrlKey: true,
          deltaY,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
        }),
      );
    };
    try {
      wheelAt(-120);
      await waitForMapSettled(canvasElement);
      const offsetBeforeFit = painted.offset;
      await userEvent.click(
        canvas.getByRole("button", { name: "Fit scatter (0)" }),
      );
      await waitFor(() => {
        expect(painted.offset).not.toBeNull();
        expect(painted.offset).toBeGreaterThan(0);
        if (offsetBeforeFit !== null)
          expect(painted.offset).not.toBe(offsetBeforeFit);
      });
      const beforeFitInterrupt = painted.offset;
      if (beforeFitInterrupt === null || beforeFitInterrupt <= 0)
        throw new Error("The fit flight has not painted a trace.");
      wheelAt(-1);
      await waitForMapSettled(canvasElement);
      expect(painted.offset).not.toBeNull();
      const ratio = painted.offset! / beforeFitInterrupt;
      expect(ratio).toBeGreaterThan(0.97);
      expect(ratio).toBeLessThan(1.06);
    } finally {
      context.clearRect = clearRect;
      context.arc = arc;
    }
  },
});

export const FilteringPreservesCamera = meta.story({
  name: "(Test) Filtering Preserves Camera",
  args: { data: nearbyCloudData, topics: denseTopics, selectedTopic: null },
  render: function Render(args) {
    const [matchingTraceIds, setMatchingTraceIds] =
      useState<ReadonlySet<string>>();
    const handleFilter = () =>
      setMatchingTraceIds(new Set([nearbyCloudData.points[0].traceId]));
    const handleNoMatches = () => setMatchingTraceIds(new Set());
    const handleClear = () => setMatchingTraceIds(undefined);
    return (
      <>
        <Button
          text="Filter matches"
          variant="secondary"
          onClick={handleFilter}
        />
        <Button
          text="No matches"
          variant="secondary"
          onClick={handleNoMatches}
        />
        <Button text="Clear filter" variant="secondary" onClick={handleClear} />
        <TopicMapExplorer {...args} matchingTraceIds={matchingTraceIds} />
      </>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const stage = canvas.getByRole("group", { name: /^Interactive scatter/ });
    await userEvent.click(canvas.getByRole("button", { name: "Zoom in (+)" }));
    await userEvent.click(canvas.getByRole("button", { name: "Zoom in (+)" }));
    await userEvent.click(canvas.getByRole("button", { name: "Zoom in (+)" }));
    await waitForMapSettled(canvasElement);
    const zoom = canvas.getByLabelText("Zoom level").textContent;
    const positions = () =>
      Array.from(
        canvasElement.querySelectorAll<HTMLElement>(
          "[data-topic-background-label]",
        ),
      ).map((label) => [
        label.dataset.topicBackgroundLabel,
        label.style.left,
        label.style.top,
        label.style.width,
        label.style.height,
      ]);
    const before = positions();
    expect(before.length).toBeGreaterThan(0);
    const total = nearbyCloudData.points.length.toLocaleString();
    await userEvent.click(
      canvas.getByRole("button", { name: "Filter matches" }),
    );
    await expect(
      canvas.getByRole("button", {
        name: `Map coverage: 1 of ${total} mapped traces match`,
      }),
    ).toBeVisible();
    await waitForMapSettled(canvasElement);
    expect(positions()).toEqual(before);
    expect(canvas.getByLabelText("Zoom level").textContent).toBe(zoom);
    await userEvent.click(canvas.getByRole("button", { name: "No matches" }));
    await expect(
      canvas.getByRole("button", {
        name: `Map coverage: 0 of ${total} mapped traces match`,
      }),
    ).toBeVisible();
    await waitForMapSettled(canvasElement);
    expect(positions()).toEqual(before);
    expect(canvas.getByLabelText("Zoom level").textContent).toBe(zoom);
    await expect(stage).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Clear filter" }));
    await expect(
      canvas.getByRole("button", {
        name: `Map coverage: ${total} mapped traces`,
      }),
    ).toBeVisible();
    await waitForMapSettled(canvasElement);
    expect(positions()).toEqual(before);
    expect(canvas.getByLabelText("Zoom level").textContent).toBe(zoom);
  },
});
