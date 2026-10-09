import { useState, type ComponentProps } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import preview from "../../../.storybook/preview";
import { Button } from "@/src/components/design-system/Button/Button";
import { EmbeddingMapView } from "./EmbeddingMapView";
import {
  fitCamera,
  prepareTopicMap,
  screenPoint,
  zoomCamera,
} from "./map/prepare-topic-map";

type ExplorerProps = ComponentProps<typeof EmbeddingMapView>;

const data = {
  points: [
    {
      traceId: "trace-billing",
      summary: "Customer asks for a copy of an invoice.",
      topicId: "billing",
      outcome: "assigned",
      x: 0,
      y: 0,
    },
    {
      traceId: "trace-outlier",
      summary: "Customer asks about a new integration.",
      topicId: null,
      outcome: "outlier",
      x: 3,
      y: 1,
    },
  ],
  missingSummaryCount: 0,
  unpositionedCount: 0,
} satisfies ComponentProps<typeof EmbeddingMapView>["data"];

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
      topicId: null,
      outcome: "outlier" as const,
      x: -30 + index * 8,
      y: 2 + Math.sin(index) * 5,
    })),
    ...Array.from({ length: 5 }, (_, index) => ({
      traceId: `demo-unassigned-${index + 1}`,
      summary:
        "An exchange-policy summary has saved coordinates but its topic assignment is unavailable.",
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
    <EmbeddingMapView
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
          "[data-topic-background-label], [data-topic-node]",
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

async function zoomToInlineNodes(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await waitForMapSettled(canvasElement);
  for (
    let attempt = 0;
    attempt < 14 &&
    canvas.queryAllByRole("button", { name: /^Select trace:/ }).length === 0;
    attempt++
  ) {
    const before = canvas.getByLabelText("Zoom level").textContent;
    await userEvent.click(canvas.getByRole("button", { name: "Zoom in (+)" }));
    await waitFor(() =>
      expect(canvas.getByLabelText("Zoom level").textContent).not.toBe(before),
    );
    await waitForMapSettled(canvasElement);
  }
  await waitFor(
    () =>
      expect(
        canvas.queryAllByRole("button", { name: /^Select trace:/ }).length,
      ).toBeGreaterThan(0),
    { timeout: 2000 },
  );
}

async function hoverInlineNode(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  const stage = canvas.getByRole("group", { name: /^Interactive topic map/ });
  const result: {
    hovered?: { node: HTMLElement; clientX: number; clientY: number };
  } = {};
  let attempt = 0;
  await waitFor(
    () => {
      const stageRect = stage.getBoundingClientRect();
      const candidates = Array.from(
        canvasElement.querySelectorAll<HTMLElement>("[data-topic-node]"),
      )
        .map((node) => ({ node, rect: node.getBoundingClientRect() }))
        .filter(
          ({ rect }) =>
            rect.left + rect.width / 2 > stageRect.left + 8 &&
            rect.left + rect.width / 2 < stageRect.right - 8 &&
            rect.top + rect.height / 2 > stageRect.top + 8 &&
            rect.top + rect.height / 2 < stageRect.bottom - 8,
        )
        .sort(
          (a, b) =>
            Math.hypot(
              a.rect.left +
                a.rect.width / 2 -
                (stageRect.left + stageRect.width / 2),
              a.rect.top +
                a.rect.height / 2 -
                (stageRect.top + stageRect.height / 2),
            ) -
            Math.hypot(
              b.rect.left +
                b.rect.width / 2 -
                (stageRect.left + stageRect.width / 2),
              b.rect.top +
                b.rect.height / 2 -
                (stageRect.top + stageRect.height / 2),
            ),
        );
      expect(candidates.length).toBeGreaterThan(0);
      const { node, rect } = candidates[0];
      const clientX = rect.left + rect.width / 2 + (attempt++ % 2 ? 2 : -2);
      const clientY = rect.top + rect.height / 2;
      node.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
          clientX,
          clientY,
        }),
      );
      expect(node).toHaveAttribute("data-hovered", "true");
      result.hovered = { node, clientX, clientY };
    },
    { timeout: 2000 },
  );
  if (!result.hovered)
    throw new Error("No visible inline node could be hovered.");
  return result.hovered;
}

const meta = preview.meta({
  component: EmbeddingMapView,
  args: {
    projectId: "storybook-project",
    topics: [{ id: "billing", name: "Billing" }],
    data,
    selectedTopic: null,
    selectedTraceId: null,
    onSelectTopic: fn(),
    onSelectTrace: fn(),
    onOpenTrace: fn(),
  },
});

export const Default = meta.story({});

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

export const MissingSummaries = meta.story({
  name: "(Test) Missing summaries coverage",
  args: { data: { ...data, missingSummaryCount: 2, unpositionedCount: 3 } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const stage = canvas.getByRole("group", { name: /^Interactive topic map/ });
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

export const ExploreZoneAndTrace = meta.story({
  name: "(Test) Select Trace And Reset Map",
  args: {
    topics: denseTopics,
    data: denseData,
    selectedTopic: "inventory-timeouts",
    selectedTraceId: null,
    onSelectTopic: fn(),
    onSelectTrace: fn(),
    onOpenTrace: fn(),
  },
  render: (args) => <ControlledExplorer {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await zoomToInlineNodes(canvasElement);

    const zoomBefore = Number.parseInt(
      canvas.getByLabelText("Zoom level").textContent ?? "0",
      10,
    );
    await userEvent.click(canvas.getByRole("button", { name: "Zoom in (+)" }));
    await waitFor(() =>
      expect(
        Number.parseInt(
          canvas.getByLabelText("Zoom level").textContent ?? "0",
          10,
        ),
      ).toBeGreaterThan(zoomBefore),
    );

    const { node: summaryButton } = await hoverInlineNode(canvasElement);
    const trace = denseData.points.find(
      (point) => point.traceId === summaryButton.getAttribute("data-trace-id"),
    );
    if (!trace)
      throw new Error("The inline summary has no matching fixture trace.");
    await expect(summaryButton).toHaveAttribute("data-hovered", "true");
    await expect(summaryButton).toBeVisible();
    await userEvent.click(summaryButton);
    await expect(args.onSelectTrace).toHaveBeenCalledWith(trace.traceId);
    const stage = canvas.getByRole("group", {
      name: /^Interactive topic map/,
    });
    await expect(args.onOpenTrace).toHaveBeenCalledWith(trace.traceId);
    stage.focus();
    await userEvent.keyboard("0");
    await expect(args.onSelectTopic).toHaveBeenLastCalledWith(null);
    await userEvent.keyboard("{Home}");
    await expect(args.onSelectTopic).toHaveBeenLastCalledWith(null);
    await userEvent.click(canvas.getByRole("button", { name: "Fit map (0)" }));
    await expect(args.onSelectTopic).toHaveBeenLastCalledWith(null);
  },
});

export const NavigationClearsHover = meta.story({
  name: "(Test) Navigation Clears Hover",
  args: {
    topics: denseTopics,
    data: denseData,
    selectedTopic: "inventory-timeouts",
    selectedTraceId: null,
  },
  render: (args) => <ControlledExplorer {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const stage = canvas.getByRole("group", {
      name: /^Interactive topic map/,
    });
    await zoomToInlineNodes(canvasElement);
    const { node, ...at } = await hoverInlineNode(canvasElement);
    const send = (type: string, offset: number, buttons: number) =>
      node.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
          buttons,
          clientX: at.clientX + offset,
          clientY: at.clientY,
        }),
      );
    const activeHover = () =>
      canvasElement.querySelector('[data-hovered="true"]');
    const capture = stage.setPointerCapture;
    stage.setPointerCapture = () => undefined;
    try {
      await expect(activeHover()).not.toBeNull();
      send("pointerdown", 0, 1);
      send("pointermove", 4, 1);
      await waitFor(() => expect(activeHover()).toBeNull());
      stage.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          pointerId: 1,
          pointerType: "mouse",
          buttons: 0,
          clientX: at.clientX + 4,
          clientY: at.clientY,
        }),
      );
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );

      const { clientX, clientY } = await hoverInlineNode(canvasElement);
      const move = () =>
        stage.dispatchEvent(
          new PointerEvent("pointermove", {
            bubbles: true,
            pointerType: "mouse",
            clientX,
            clientY,
          }),
        );
      await expect(activeHover()).not.toBeNull();
      stage.focus();
      await userEvent.keyboard("+");
      await waitFor(() => expect(activeHover()).toBeNull());
      move();
      await expect(activeHover()).toBeNull();

      await hoverInlineNode(canvasElement);
      const section = canvas.getByRole("region", { name: "Embedding map" });
      const originalStyleWidth = section.style.width;
      const originalStageWidth = stage.getBoundingClientRect().width;
      try {
        section.style.width = `${section.getBoundingClientRect().width - 80}px`;
        await waitFor(() =>
          expect(stage.getBoundingClientRect().width).toBeLessThan(
            originalStageWidth,
          ),
        );
        await waitFor(() => expect(activeHover()).toBeNull());
        section.style.width = originalStyleWidth;
        await waitFor(() =>
          expect(stage.getBoundingClientRect().width).toBe(originalStageWidth),
        );
        let previousBounds = "";
        let changedAt = performance.now();
        await waitFor(
          () => {
            const bounds = Array.from(
              canvasElement.querySelectorAll<HTMLElement>("[data-topic-node]"),
            )
              .map((node) => node.getAttribute("style"))
              .join(";");
            if (bounds !== previousBounds) {
              previousBounds = bounds;
              changedAt = performance.now();
            }
            expect(performance.now() - changedAt).toBeGreaterThan(150);
          },
          { timeout: 2000 },
        );
        await expect(activeHover()).toBeNull();
      } finally {
        section.style.width = originalStyleWidth;
      }
    } finally {
      stage.setPointerCapture = capture;
    }
  },
});

export const ReadingKeepsZoomedCloud = meta.story({
  name: "(Test) Reading Keeps Zoomed Cloud",
  args: {
    topics: denseTopics,
    data: nearbyCloudData,
    selectedTopic: null,
    selectedTraceId: null,
    onSelectTopic: fn(),
  },
  render: (args) => <ControlledExplorer {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const stage = canvas.getByRole("group", {
      name: /^Interactive topic map/,
    });
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const model = prepareTopicMap(nearbyCloudData, denseTopics);
    const cloud = model.zones.find((zone) => zone.id === "inventory-timeouts");
    if (!cloud) throw new Error("The inventory cloud fixture is missing.");
    const stageRect = stage.getBoundingClientRect();
    const plot = { width: stageRect.width, height: stageRect.height };
    const initial = fitCamera(model.bounds, model.bounds, plot);
    const at = screenPoint(cloud, initial, model.bounds, plot);
    const zoomInput = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaY: -40 * Math.log2(10),
      clientX: stageRect.left + at.x,
      clientY: stageRect.top + at.y,
    });
    const zoomed = zoomCamera(
      initial,
      Math.log2(10),
      {
        x: (zoomInput.clientX - stageRect.left) / plot.width,
        y: (zoomInput.clientY - stageRect.top) / plot.height,
      },
      model.bounds,
      plot,
    );
    stage.dispatchEvent(zoomInput);
    await waitFor(() =>
      expect(canvas.getByLabelText("Zoom level")).toHaveTextContent("1000%"),
    );
    await hoverInlineNode(canvasElement);
    const result: { node?: HTMLElement } = {};
    await waitFor(
      () => {
        const nodes = Array.from(
          canvasElement.querySelectorAll<HTMLElement>("[data-topic-node]"),
        )
          .map((node) => {
            const rect = node.getBoundingClientRect();
            return {
              node,
              rect,
              distance: Math.hypot(
                rect.left + rect.width / 2 - (stageRect.left + at.x),
                rect.top + rect.height / 2 - (stageRect.top + at.y),
              ),
            };
          })
          .filter(
            ({ node, rect }) =>
              Number(node.style.opacity) > 0.05 &&
              node.dataset.traceId?.startsWith("demo-inventory-timeouts-") &&
              rect.left >= stageRect.left + 4 &&
              rect.right <= stageRect.right - 4 &&
              rect.top >= stageRect.top + 4 &&
              rect.bottom <= stageRect.bottom - 4,
          )
          .sort((a, b) => a.distance - b.distance);
        expect(nodes.length).toBeGreaterThan(0);
        expect(nodes[0].node.dataset.traceId).toMatch(
          /^demo-inventory-timeouts-/,
        );
        const saved = model.pointById.get(nodes[0].node.dataset.traceId ?? "");
        if (!saved)
          throw new Error("The inline node has no saved fixture coordinate.");
        const expected = screenPoint(saved, zoomed, model.bounds, plot);
        expect(
          nodes[0].rect.left + nodes[0].rect.width / 2 - stageRect.left,
        ).toBeCloseTo(expected.x, 1);
        expect(
          nodes[0].rect.top + nodes[0].rect.height / 2 - stageRect.top,
        ).toBeCloseTo(expected.y, 1);
        result.node = nodes[0].node;
      },
      { timeout: 2000 },
    );
    await expect(args.onSelectTopic).not.toHaveBeenCalled();
    if (!result.node)
      throw new Error("No readable trace remains near the zoom anchor.");
    const node = result.node;
    const beforePan = node.getBoundingClientRect();
    stage.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaX: 40,
        deltaY: -20,
      }),
    );
    await waitFor(
      () => {
        const rect = node.getBoundingClientRect();
        expect(Math.abs(rect.left - (beforePan.left - 40))).toBeLessThan(0.2);
        expect(Math.abs(rect.top - (beforePan.top + 20))).toBeLessThan(0.2);
      },
      { timeout: 2000 },
    );
    await expect(canvas.getByLabelText("Zoom level")).toHaveTextContent(
      "1000%",
    );
    await expect(args.onSelectTopic).not.toHaveBeenCalled();
  },
});

export const HoverPreservesMapGeometry = meta.story({
  name: "(Test) Hover Preserves Map Geometry",
  args: {
    fillContainer: true,
    data,
    selectedTopic: null,
    selectedTraceId: null,
    onSelectTrace: fn(),
    onOpenTrace: fn(),
  },
  render: (args) => (
    <div style={{ height: 680 }}>
      <ControlledExplorer {...args} />
    </div>
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const stage = canvas.getByRole("group", { name: /^Interactive topic map/ });
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
    await expect(args.onOpenTrace).toHaveBeenLastCalledWith(trace.traceId);
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
          topicId: "inventory-timeouts",
          outcome: "assigned",
          x: -5,
          y: -25,
        },
        {
          traceId: "flight-marker-right",
          summary: "A repeated inventory lookup returns the same timeout.",
          topicId: "inventory-timeouts",
          outcome: "assigned",
          x: -4.75,
          y: -25,
        },
        ...denseData.points,
      ],
    },
    selectedTopic: "inventory-timeouts",
  },
  render: function Render(args) {
    const [selectedTopic, setSelectedTopic] = useState(args.selectedTopic);
    const handleRestoreOverview = () => setSelectedTopic(null);
    return (
      <>
        <Button
          text="Restore overview"
          variant="secondary"
          onClick={handleRestoreOverview}
        />
        <EmbeddingMapView {...args} selectedTopic={selectedTopic} />
      </>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const stage = canvas.getByRole("group", { name: /^Interactive topic map/ });
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const drawing = stage.querySelector("canvas");
    const context = drawing?.getContext("2d");
    if (!context) throw new Error("The map canvas context is unavailable.");
    const clearRect = context.clearRect;
    const scale = context.scale;
    const roundRect = context.roundRect;
    const painted = {
      scale: null as number | null,
      distance: null as number | null,
      centers: [] as { x: number; y: number }[],
      at: 0,
    };
    context.clearRect = (x, y, width, height) => {
      painted.scale = null;
      painted.distance = null;
      painted.centers = [];
      painted.at = performance.now();
      clearRect.call(context, x, y, width, height);
    };
    context.scale = (x, y) => {
      if (painted.scale === null) painted.scale = x;
      scale.call(context, x, y);
    };
    context.roundRect = (x, y, width, height, radii) => {
      if (painted.centers.length < 2) {
        painted.centers.push({ x: x + width / 2, y: y + height / 2 });
        if (painted.centers.length === 2)
          painted.distance = Math.hypot(
            painted.centers[0].x - painted.centers[1].x,
            painted.centers[0].y - painted.centers[1].y,
          );
      }
      roundRect.call(context, x, y, width, height, radii);
    };
    try {
      await userEvent.click(
        canvas.getByRole("button", { name: "Restore overview" }),
      );
      await new Promise<void>((resolve) => setTimeout(resolve, 150));
      const before = painted.scale;
      if (before === null || before <= 0)
        throw new Error("The topic flight has not painted a cloud scale.");
      const rect = stage.getBoundingClientRect();
      const interruptedAt = performance.now();
      stage.dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          ctrlKey: true,
          deltaY: -1,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
        }),
      );
      await new Promise<void>((resolve) => setTimeout(resolve, 240));
      await waitFor(() => {
        expect(painted.at).toBeGreaterThan(interruptedAt);
        expect(painted.scale).not.toBeNull();
        const ratio = painted.scale! / before;
        expect(ratio).toBeGreaterThan(0.7);
        expect(ratio).toBeLessThan(1.3);
      });

      await waitForMapSettled(canvasElement);
      stage.dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          ctrlKey: true,
          deltaY: -120,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
        }),
      );
      await waitForMapSettled(canvasElement);
      await userEvent.click(
        canvas.getByRole("button", { name: "Fit map (0)" }),
      );
      await new Promise<void>((resolve) => setTimeout(resolve, 420));
      const beforeFitInterrupt = painted.distance;
      if (beforeFitInterrupt === null || beforeFitInterrupt <= 0)
        throw new Error("The fit flight has not painted both trace markers.");
      const fitInterruptedAt = performance.now();
      stage.dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          ctrlKey: true,
          deltaY: -1,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
        }),
      );
      await new Promise<void>((resolve) => setTimeout(resolve, 240));
      await waitFor(() => {
        expect(painted.at).toBeGreaterThan(fitInterruptedAt);
        expect(painted.distance).not.toBeNull();
        const ratio = painted.distance! / beforeFitInterrupt;
        expect(ratio).toBeGreaterThan(0.97);
        expect(ratio).toBeLessThan(1.06);
      });
    } finally {
      context.clearRect = clearRect;
      context.scale = scale;
      context.roundRect = roundRect;
    }
  },
});
