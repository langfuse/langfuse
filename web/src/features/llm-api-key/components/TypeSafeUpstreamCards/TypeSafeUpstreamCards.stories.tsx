import { useState } from "react";
import type { TypeSafeUpstream } from "@langfuse/shared";
import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../../../.storybook/preview";
import { TypeSafeUpstreamCards } from "./TypeSafeUpstreamCards";

const meta = preview.meta({
  component: TypeSafeUpstreamCards,
});

export const Default = meta.story({
  args: {
    "aria-label": "Upstream",
    value: "typesafe",
    onValueChange: fn(),
  },
  render: function Render(args) {
    const [value, setValue] = useState<TypeSafeUpstream>(args.value);

    return (
      <TypeSafeUpstreamCards
        {...args}
        value={value}
        onValueChange={(next) => {
          setValue(next);
          args.onValueChange(next);
        }}
      />
    );
  },
});

export const OpenRouterSelected = meta.story({
  args: {
    "aria-label": "Upstream",
    value: "openrouter",
    onValueChange: fn(),
  },
});

export const Disabled = meta.story({
  args: {
    "aria-label": "Upstream",
    value: "vercel-ai-gateway",
    onValueChange: fn(),
    disabled: true,
  },
});

export const TestSelectsUpstream = meta.story({
  name: "(Test) Selects Upstream",
  args: {
    "aria-label": "Upstream",
    value: "typesafe",
    onValueChange: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole("radio", { name: "TypeSafe" })).toBeChecked();

    await userEvent.click(canvas.getByRole("radio", { name: "OpenRouter" }));

    await expect(args.onValueChange).toHaveBeenCalledWith("openrouter");
  },
});
