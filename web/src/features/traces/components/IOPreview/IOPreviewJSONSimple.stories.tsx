import preview from "../../../../../.storybook/preview";
import { expect, spyOn, userEvent } from "storybook/test";
import { IOPreviewJSONSimple } from "./IOPreviewJSONSimple";
import { JSON_VIEW_RENDER_CHAR_LIMIT } from "./fns/jsonViewSizeGate";

const meta = preview.meta({
  component: IOPreviewJSONSimple,
  args: {
    projectId: "storybook-project",
    traceId: "storybook-trace",
    showCorrections: false,
    hideInput: true,
    hideOutput: true,
    hideMetadata: true,
  },
});

export const DefaultStatus = meta.story({
  args: {
    status: {
      level: "DEFAULT",
      message: "The observation completed with additional status details.",
    },
  },
});

export const DebugStatus = meta.story({
  args: {
    status: {
      level: "DEBUG",
      message: "Detailed diagnostic information for this observation.",
    },
  },
});

export const WarningStatus = meta.story({
  args: {
    status: {
      level: "WARNING",
      message: "The observation completed with a recoverable warning.",
    },
  },
});

export const ErrorStatus = meta.story({
  name: "(Test) Renders Error Message",
  args: {
    status: {
      level: "ERROR",
      message: "Upstream model request timed out after 30 seconds.",
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Error")).toBeVisible();
    await expect(
      canvas.getByText("Upstream model request timed out after 30 seconds."),
    ).toBeVisible();
  },
});

export const StructuredStatus = meta.story({
  name: "(Test) Structured status",
  args: {
    status: {
      level: "ERROR",
      message: '{"error":{"code":"timeout","retryable":true}}',
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Error")).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Expand all rows" }),
    ).not.toBeInTheDocument();
  },
});

const oversizedInput = "eyJhIjoxfQ==" + "A".repeat(JSON_VIEW_RENDER_CHAR_LIMIT);

export const OversizedInput = meta.story({
  name: "(Test) Oversized input uses bounded fallback",
  args: { input: oversizedInput, hideInput: false, hideIfNull: true },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(/too large to render in JSON view/i),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: /Download Input/i }),
    ).toBeVisible();
    await expect(canvas.queryByText(oversizedInput)).not.toBeInTheDocument();
  },
});

export const DownloadOversizedString = meta.story({
  name: "(Test) Downloads oversized strings as raw text",
  args: { input: oversizedInput, hideInput: false, hideIfNull: true },
  play: async ({ canvas }) => {
    const createObjectURL = spyOn(URL, "createObjectURL").mockReturnValue(
      "blob:mock",
    );
    const revokeObjectURL = spyOn(URL, "revokeObjectURL").mockImplementation(
      () => {},
    );
    const downloads: HTMLAnchorElement[] = [];
    const click = spyOn(
      HTMLAnchorElement.prototype,
      "click",
    ).mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this);
    });
    try {
      await userEvent.click(
        canvas.getByRole("button", { name: /Download Input/i }),
      );
      await expect(createObjectURL).toHaveBeenCalledTimes(1);
      const blob = createObjectURL.mock.calls[0]?.[0];
      if (!(blob instanceof Blob))
        throw new Error("Expected a downloadable Blob");
      await expect(await blob.text()).toBe(oversizedInput);
      await expect(blob.type).toContain("text/plain");
      await expect(downloads[0]?.download).toBe("input-storybook-trace.txt");
    } finally {
      createObjectURL.mockRestore();
      revokeObjectURL.mockRestore();
      click.mockRestore();
    }
  },
});

export const NullInput = meta.story({
  name: "(Test) Null input is hidden without a size fallback",
  args: { input: null, hideInput: false, hideIfNull: true },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText("Input")).not.toBeInTheDocument();
    await expect(
      canvas.queryByText(/too large to render in JSON view/i),
    ).not.toBeInTheDocument();
  },
});

export const SmallInput = meta.story({
  name: "(Test) Small input renders without a size fallback",
  args: {
    input: { messages: [{ role: "user", content: "hi" }] },
    hideInput: false,
    hideIfNull: true,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Input")).toBeVisible();
    await expect(
      canvas.getAllByText(/hi/).some((element) => element.checkVisibility()),
    ).toBe(true);
    await expect(
      canvas.queryByText(/too large to render in JSON view/i),
    ).not.toBeInTheDocument();
  },
});
