import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { SwitchInput } from "./SwitchInput";

function SwitchInputExample() {
  const [checked, setChecked] = useState(true);

  return (
    <SwitchInput
      id="integration-enabled"
      aria-label="Enable integration"
      description="Send data to PostHog while this integration is active."
      checked={checked}
      onCheckedChange={setChecked}
    />
  );
}

const meta = preview.meta({
  component: SwitchInputExample,
});

export const Default = meta.story({});

export const ChangesValue = meta.story({
  name: "(Test) Changes value",
  play: async ({ canvasElement }) => {
    const control = within(canvasElement).getByRole("switch", {
      name: "Enable integration",
    });

    await expect(control).toBeChecked();
    await userEvent.click(
      within(canvasElement).getByText(
        "Send data to PostHog while this integration is active.",
      ),
    );
    await expect(control).not.toBeChecked();
  },
});
