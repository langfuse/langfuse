import { expect, fn, spyOn, userEvent, within } from "storybook/test";
import preview from "../../../.storybook/preview";
import { TraceliftPanelContent } from "./TraceliftPanelContent";
import { createTraceliftPreviewFindings } from "./fixtures/previewFindings";

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
const findings = createTraceliftPreviewFindings();

export const AllSuggestions = meta.story({
  args: { status: "success", findings, ...callbacks },
});
export const InfrastructureSpans = meta.story({
  args: {
    status: "success",
    findings: findings.filter(({ id }) => id === "INFRASTRUCTURE_SPANS"),
    ...callbacks,
  },
});
export const WithoutAssistant = meta.story({
  args: {
    status: "success",
    findings,
    ...callbacks,
    onOpenAssistant: undefined,
  },
});
export const Empty = meta.story({
  args: { status: "success", findings: [], ...callbacks },
});
export const Loading = meta.story({
  args: { status: "loading", ...callbacks },
});
export const Error = meta.story({
  args: { status: "error", onRetry: fn(), ...callbacks },
});

export const ReviewAnotherSuggestion = meta.story({
  name: "(Test) Review Another Suggestion",
  args: { status: "success", findings, ...callbacks },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const second = canvas.getByRole("button", {
      name: /Connect related operations/,
    });
    await userEvent.click(second);
    await expect(second).toHaveAttribute("aria-expanded", "true");
    const section = within(
      canvas.getByRole("region", { name: /Connect related operations/ }),
    );
    await expect(section.getByRole("link")).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Use Assistant" }),
    );
    await expect(args.onOpenAssistant).toHaveBeenCalledWith(
      findings.map(({ prompt }) => prompt).join("\n\n---\n\n"),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Close Instrumentation suggestions" }),
    );
    await expect(args.onClose).toHaveBeenCalledOnce();
  },
});

export const CopyPromptAfterRetry = meta.story({
  name: "(Test) Copy Prompt After Retry",
  args: { status: "success", findings, ...callbacks },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const copy = spyOn(navigator.clipboard, "writeText")
      .mockRejectedValueOnce(new DOMException("Clipboard access denied"))
      .mockResolvedValue();
    try {
      await userEvent.click(
        canvas.getByRole("button", { name: "Copy prompt" }),
      );
      await expect(canvas.getByRole("status")).toHaveTextContent(
        "Could not copy the prompt",
      );
      await userEvent.click(
        canvas.getByRole("button", { name: "Copy prompt" }),
      );
      await expect(
        canvas.getByRole("button", { name: "Prompt copied" }),
      ).toBeVisible();
      await expect(copy).toHaveBeenLastCalledWith(
        findings.map(({ prompt }) => prompt).join("\n\n---\n\n"),
      );
      await expect(canvas.queryByRole("status")).not.toBeInTheDocument();
    } finally {
      copy.mockRestore();
    }
  },
});
