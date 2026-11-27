import { expect, fn, userEvent } from "storybook/test";

import preview from "@/.storybook/preview";
import { GatewayNoGuardrailsEmptyState } from "./GatewayNoGuardrailsEmptyState";

const meta = preview.meta({
  component: GatewayNoGuardrailsEmptyState,
  parameters: { layout: "padded" },
});

export const Default = meta.story({
  args: { mode: "manage", onAddGuardrail: fn(), onSelectTemplate: fn() },
});

export const ReadOnly = meta.story({
  args: { mode: "readOnly" },
});

export const SelectsTemplate = meta.story({
  name: "(Test) Selects template",
  args: { mode: "manage", onAddGuardrail: fn(), onSelectTemplate: fn() },
  play: async ({ canvas, args }) => {
    if (args.mode !== "manage") {
      throw new Error("Expected manage mode");
    }

    await userEvent.click(canvas.getByRole("button", { name: /PII/ }));
    await expect(args.onSelectTemplate).toHaveBeenCalledWith("pii");

    await userEvent.click(
      canvas.getByRole("button", { name: /Prompt injection/ }),
    );
    await expect(args.onSelectTemplate).toHaveBeenCalledWith(
      "prompt_injection",
    );

    await userEvent.click(
      canvas.getByRole("button", { name: /Amazon Bedrock/ }),
    );
    await expect(args.onSelectTemplate).toHaveBeenCalledWith("bedrock");
  },
});
