import { expect, fn, spyOn, userEvent, waitFor, within } from "storybook/test";

import preview from "../../../.storybook/preview";
import { TraceliftPanelContent } from "./TraceliftPanelContent";
import { createTraceliftPreviewFindings } from "./fixtures/previewFindings";
import { type TraceliftFinding } from "./types";

const meta = preview.meta({
  component: TraceliftPanelContent,
  parameters: { layout: "fullscreen" },
});

const callbacks = {
  onClose: fn(),
  onOpenAssistant: fn(),
  onViewObservations: fn(),
  onViewExample: fn(),
};

const summary = { issueCount: 5, langfuseIngestionCostUsd: 0.0005 };

const additionalFindings: TraceliftFinding[] = [
  {
    id: "missing-context",
    recommendation: null,
    examples: [],
    title: "Spans with little context",
    description:
      "A useful span explains what happened. Review whether these examples would benefit from clearer inputs, outputs, or metadata.",
    issueCount: 1,
    langfuseIngestionCostUsd: 0.0001,
    observationIds: ["tracelift-support-obs-2"],
    observationNames: ["classify-intent"],
    prompt:
      "Review these sample spans and suggest the context needed to understand their work.",
  },
  {
    id: "generic-names",
    recommendation: null,
    examples: [],
    title: "Names that are hard to distinguish",
    description:
      "Specific operation names can help people scan a trace. Check whether the current names explain the work without needing to open every span.",
    issueCount: 3,
    langfuseIngestionCostUsd: 0.0003,
    observationIds: [
      "tracelift-support-obs-8",
      "tracelift-support-obs-10",
      "tracelift-support-obs-12",
    ],
    observationNames: ["llm.chat"],
    prompt:
      "Review these sample span names and suggest names that describe their purpose.",
  },
  {
    id: "missing-parent",
    recommendation: null,
    examples: [],
    title: "Spans to check for missing parents",
    description:
      "Disconnected work can make the execution path hard to follow. Verify the complete trace before changing context propagation.",
    issueCount: 1,
    langfuseIngestionCostUsd: 0.0001,
    observationIds: ["tracelift-support-obs-7"],
    observationNames: ["tickets.search"],
    prompt:
      "Review context propagation for these sample spans after loading their complete traces.",
  },
  {
    id: "unfinished-spans",
    recommendation: null,
    examples: [],
    title: "Spans without an end time",
    description:
      "Some work may still be running. For completed requests, check that instrumentation closes spans on both success and failure.",
    issueCount: 1,
    langfuseIngestionCostUsd: 0.0001,
    observationIds: ["tracelift-support-obs-15"],
    observationNames: ["zendesk.send-reply"],
    prompt:
      "Review these sample spans and check that completed work closes its spans on success and failure.",
  },
];

export const ThreeConditions = meta.story({
  args: {
    status: "success",
    findings: createTraceliftPreviewFindings(),
    summary,
    ...callbacks,
  },
});

export const TwoConditions = meta.story({
  args: {
    status: "success",
    findings: createTraceliftPreviewFindings().slice(0, 2),
    summary: { issueCount: 4, langfuseIngestionCostUsd: 0.0004 },
    ...callbacks,
  },
});

export const SevenConditions = meta.story({
  args: {
    status: "success",
    findings: [...createTraceliftPreviewFindings(), ...additionalFindings],
    summary: { issueCount: 8, langfuseIngestionCostUsd: 0.0008 },
    ...callbacks,
  },
});

export const Empty = meta.story({
  args: {
    status: "success",
    findings: [],
    summary: { issueCount: 0, langfuseIngestionCostUsd: 0 },
    ...callbacks,
  },
});

export const ReviewAnotherCondition = meta.story({
  name: "(Test) Review Another Condition",
  args: {
    status: "success",
    findings: createTraceliftPreviewFindings(),
    summary,
    ...callbacks,
  },
  play: async ({ canvasElement, args }) => {
    if (args.status !== "success")
      throw new Error("This story requires findings");
    const canvas = within(canvasElement);
    const first = canvas.getByRole("button", {
      name: /Unnecessary wrapper spans/,
    });
    const second = canvas.getByRole("button", {
      name: /Repeated generation calls/,
    });

    await userEvent.click(first);
    await userEvent.click(second);
    await expect(second).toHaveAttribute("aria-expanded", "true");
    const condition = within(
      canvas.getByRole("region", { name: /Repeated generation calls/ }),
    );

    await userEvent.click(
      condition.getByRole("button", { name: "Open assistant" }),
    );
    await expect(args.onOpenAssistant).toHaveBeenCalledWith(args.findings[1]);
    await userEvent.click(
      condition.getByRole("button", { name: "View observations" }),
    );
    await expect(args.onViewObservations).toHaveBeenCalledWith(
      args.findings[1],
    );
    await userEvent.click(
      canvas.getByRole("button", {
        name: "Close Trace fixes",
      }),
    );
    await expect(args.onClose).toHaveBeenCalledOnce();
  },
});

export const CopyPromptAfterRetry = meta.story({
  name: "(Test) Copy Prompt After Retry",
  args: {
    status: "success",
    findings: createTraceliftPreviewFindings(),
    summary,
    ...callbacks,
  },
  play: async ({ canvasElement, args }) => {
    if (args.status !== "success")
      throw new Error("This story requires findings");
    const canvas = within(canvasElement);
    const copy = spyOn(navigator.clipboard, "writeText")
      .mockRejectedValueOnce(new DOMException("Clipboard access denied"))
      .mockResolvedValue();

    try {
      await userEvent.click(
        canvas.getByRole("button", { name: "Copy agent prompt" }),
      );
      await expect(canvas.getByRole("status")).toHaveTextContent(
        "Could not copy the prompt",
      );
      await expect(
        canvas.queryByRole("button", { name: "Prompt copied" }),
      ).not.toBeInTheDocument();

      await userEvent.click(
        canvas.getByRole("button", { name: "Copy agent prompt" }),
      );
      await expect(
        canvas.getByRole("button", { name: "Prompt copied" }),
      ).toBeVisible();
      await expect(copy).toHaveBeenLastCalledWith(args.findings[0]!.prompt);
      await expect(canvas.queryByRole("status")).not.toBeInTheDocument();
    } finally {
      copy.mockRestore();
    }
  },
});

export const InspectObservationIds = meta.story({
  name: "(Test) Inspect Observation IDs",
  args: {
    status: "success",
    findings: createTraceliftPreviewFindings(),
    summary,
    ...callbacks,
  },
  play: async ({ canvasElement, args }) => {
    if (args.status !== "success")
      throw new Error("This story requires findings");
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: /Repeated generation calls/ }),
    );
    const condition = within(
      canvas.getByRole("region", { name: /Repeated generation calls/ }),
    );
    const disclosure = condition.getByRole("button", {
      name: "Show IDs",
    });

    await expect(disclosure).toHaveAttribute("aria-expanded", "false");
    for (const id of args.findings[1]!.observationIds) {
      await expect(condition.queryByText(id)).not.toBeInTheDocument();
    }

    await userEvent.click(disclosure);
    await expect(disclosure).toHaveAttribute("aria-expanded", "true");
    for (const id of args.findings[1]!.observationIds) {
      await expect(condition.getByText(id)).toBeVisible();
    }

    await userEvent.click(disclosure);
    await expect(disclosure).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => {
      expect(
        condition.queryByText(args.findings[1]!.observationIds[0]!),
      ).not.toBeInTheDocument();
    });
  },
});

export const SummaryAcrossConditions = meta.story({
  name: "(Test) Summary Across Conditions",
  args: {
    status: "success",
    findings: createTraceliftPreviewFindings(),
    summary,
    ...callbacks,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const overview = within(canvas.getByRole("region", { name: "Summary" }));
    await expect(overview.getByText("5")).toBeVisible();
    await expect(overview.getByText("$0.0005")).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: /Unnecessary wrapper spans/ }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: /Repeated generation calls/ }),
    );
    await expect(overview.getByText("5")).toBeVisible();
    await expect(overview.getByText("$0.0005")).toBeVisible();
    await expect(
      canvas.getAllByText("Langfuse ingestion cost (USD)"),
    ).toHaveLength(1);
  },
});
