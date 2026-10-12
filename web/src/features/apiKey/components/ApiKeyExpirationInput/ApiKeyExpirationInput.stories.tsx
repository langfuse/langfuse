import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../../../.storybook/preview";
import { ApiKeyExpirationInput } from "./ApiKeyExpirationInput";
import type { ApiKeyExpirationPreset } from "@/src/features/apiKey/constants/apiKeyExpirationOptions";

const meta = preview.meta({
  component: ApiKeyExpirationInput,
});

export const Default = meta.story({
  args: {
    id: "api-key-expiration-default",
    expiryPreset: "never",
    customExpiry: "",
    onExpiryPresetChange: fn(),
    onCustomExpiryChange: fn(),
  },
});

export const CustomDate = meta.story({
  args: {
    id: "api-key-expiration-custom",
    expiryPreset: "custom",
    customExpiry: "2026-12-31",
    onExpiryPresetChange: fn(),
    onCustomExpiryChange: fn(),
  },
});

export const SelectsCustomDate = meta.story({
  name: "(Test) Selects Custom Date",
  args: {
    id: "api-key-expiration-interactive",
    expiryPreset: "never",
    customExpiry: "",
    onExpiryPresetChange: fn(),
    onCustomExpiryChange: fn(),
  },
  render: (args) => {
    const [expiryPreset, setExpiryPreset] =
      useState<ApiKeyExpirationPreset>("never");
    const [customExpiry, setCustomExpiry] = useState("");

    const handleExpiryPresetChange = (value: ApiKeyExpirationPreset) => {
      setExpiryPreset(value);
      args.onExpiryPresetChange(value);
    };
    const handleCustomExpiryChange = (value: string) => {
      setCustomExpiry(value);
      args.onCustomExpiryChange(value);
    };

    return (
      <ApiKeyExpirationInput
        {...args}
        expiryPreset={expiryPreset}
        customExpiry={customExpiry}
        onExpiryPresetChange={handleExpiryPresetChange}
        onCustomExpiryChange={handleCustomExpiryChange}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole("combobox"));
    await userEvent.click(body.getByRole("option", { name: "Custom date…" }));
    await expect(canvas.getByLabelText("Custom expiration date")).toBeVisible();
  },
});
