import { useState, type ComponentProps } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import preview from "../../../.storybook/preview";
import { EmbeddingMapView } from "./EmbeddingMapView";

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

function ControlledExplorer(args: ExplorerProps) {
  const [selectedTopic, setSelectedTopic] = useState(args.selectedTopic);
  const [selectedTraceId, setSelectedTraceId] = useState(args.selectedTraceId);
  return (
    <EmbeddingMapView
      {...args}
      selectedTopic={selectedTopic}
      selectedTraceId={selectedTraceId}
      onSelectTopic={(id) => {
        setSelectedTopic(id);
        setSelectedTraceId(null);
        args.onSelectTopic(id);
      }}
      onSelectTrace={(id) => {
        setSelectedTraceId(id);
        args.onSelectTrace(id);
      }}
    />
  );
}

async function zoomToInlineNodes(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  let previous = canvas.getByLabelText("Zoom level").textContent;
  let changedAt = performance.now();
  await waitFor(() => {
    const current = canvas.getByLabelText("Zoom level").textContent;
    if (current !== previous) {
      previous = current;
      changedAt = performance.now();
    }
    expect(performance.now() - changedAt).toBeGreaterThan(150);
  });
  for (
    let attempt = 0;
    attempt < 10 &&
    Number.parseInt(
      canvas.getByLabelText("Zoom level").textContent ?? "0",
      10,
    ) < 1000;
    attempt++
  ) {
    const before = canvas.getByLabelText("Zoom level").textContent;
    await userEvent.click(canvas.getByRole("button", { name: "Zoom in (+)" }));
    await waitFor(() =>
      expect(canvas.getByLabelText("Zoom level").textContent).not.toBe(before),
    );
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

export const MissingSummaries = meta.story({
  args: { data: { ...data, missingSummaryCount: 2, unpositionedCount: 3 } },
});

export const DenseIssueCloud = meta.story({
  args: {
    topics: denseTopics,
    data: denseData,
    headerStats: `${denseData.points.length} traces · ${denseTopics.length} topics`,
  },
  render: (args) => <ControlledExplorer {...args} />,
});

export const ExploreZoneAndTrace = meta.story({
  name: "(Test) Explore Zone And Trace",
  args: {
    topics: denseTopics,
    data: denseData,
    selectedTopic: null,
    selectedTraceId: null,
    onSelectTopic: fn(),
    onSelectTrace: fn(),
    onOpenTrace: fn(),
  },
  render: (args) => <ControlledExplorer {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryAllByRole("button", { name: /^Select trace:/ }),
    ).toHaveLength(0);
    await expect(canvas.queryAllByTestId("topic-map-zone-card")).toHaveLength(
      0,
    );
    await userEvent.click(
      canvas.getByRole("button", { name: /^Explore Inventory timeouts,/ }),
    );
    await expect(args.onSelectTopic).toHaveBeenCalledWith("inventory-timeouts");
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
    const inspector = within(canvas.getByLabelText("Map details"));
    await expect(inspector.getByText(trace.traceId)).toBeVisible();
    await expect(inspector.getByText(trace.summary)).toBeVisible();
    const stage = canvas.getByRole("group", {
      name: /^Interactive topic map/,
    });
    stage.focus();
    await userEvent.keyboard("0");
    await expect(args.onSelectTopic).toHaveBeenLastCalledWith(
      "inventory-timeouts",
    );
    await expect(inspector.getByText(trace.traceId)).toBeVisible();
    await userEvent.keyboard("{Home}");
    await expect(args.onSelectTopic).toHaveBeenLastCalledWith(
      "inventory-timeouts",
    );
    await userEvent.click(
      inspector.getByRole("button", { name: "Open trace" }),
    );
    await expect(args.onOpenTrace).toHaveBeenCalledWith(trace.traceId);
    await userEvent.click(canvas.getByRole("button", { name: "All topics" }));
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
