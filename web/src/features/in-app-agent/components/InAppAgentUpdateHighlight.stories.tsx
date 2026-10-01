import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { InAppAgentUpdateHighlight } from "./InAppAgentUpdateHighlight";

const meta = preview.meta({ component: InAppAgentUpdateHighlight });

export const Highlighted = meta.story({
  args: {
    updateId: "assistant-update",
    children: (
      <div className="rounded-md border p-4">
        Content updated by the Assistant
      </div>
    ),
  },
});

export const WithoutAssistantUpdate = meta.story({
  args: {
    updateId: null,
    children: <div>Content</div>,
  },
});

export const UnhighlightedAccessibility = meta.story({
  name: "(Test) Unhighlighted Accessibility",
  args: {
    updateId: null,
    children: <div>Content</div>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText("Content")).toBeVisible();
    await expect(
      canvasElement.querySelector('[aria-hidden="true"]'),
    ).toBeNull();
  },
});

export const RetriggersHighlight = meta.story({
  name: "(Test) Retriggers Highlight",
  args: {
    updateId: "update-1",
    children: <div>Updated content</div>,
  },
  render: function Render(args) {
    const [updateId, setUpdateId] = useState(args.updateId);

    return (
      <>
        <button type="button" onClick={() => setUpdateId("update-2")}>
          Apply next Assistant update
        </button>
        <InAppAgentUpdateHighlight {...args} updateId={updateId} />
      </>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const firstHighlight = canvasElement.querySelector('[aria-hidden="true"]');

    await expect(firstHighlight).not.toBeNull();
    await expect(canvas.getByText("Updated content")).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Apply next Assistant update" }),
    );

    const nextHighlight = canvasElement.querySelector('[aria-hidden="true"]');
    await expect(nextHighlight).not.toBe(firstHighlight);
    await expect(nextHighlight).toHaveAttribute("aria-hidden", "true");
    await expect(
      canvasElement.querySelectorAll('[aria-hidden="true"]'),
    ).toHaveLength(1);
    await expect(canvas.getByText("Updated content")).toBeVisible();
  },
});
