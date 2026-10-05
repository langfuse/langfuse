import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { ToggleableCard } from "./ToggleableCard";

function ToggleableCardExample() {
  const [checked, setChecked] = useState(true);

  return (
    <ToggleableCard
      id="scheduled-exports"
      title="Scheduled exports"
      checked={checked}
      disabled={false}
      onCheckedChange={setChecked}
      actions={null}
    >
      <p className="text-muted-foreground text-sm">
        Settings controlled by the enabled state.
      </p>
    </ToggleableCard>
  );
}

const meta = preview.meta({
  component: ToggleableCardExample,
});

export const Default = meta.story({});

export const CollapsesContent = meta.story({
  name: "(Test) Collapses content",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const control = canvas.getByRole("switch", {
      name: "Scheduled exports",
    });

    await expect(control).toBeChecked();
    await expect(
      canvas.getByText("Settings controlled by the enabled state."),
    ).toBeVisible();
    await userEvent.click(control);
    await expect(control).not.toBeChecked();
    await expect(
      canvas.queryByText("Settings controlled by the enabled state."),
    ).not.toBeInTheDocument();
  },
});
