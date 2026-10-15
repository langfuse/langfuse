import { expect, userEvent, waitFor, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { Accordion } from "./Accordion";

const meta = preview.meta({
  component: Accordion,
});

const defaultChildren = (
  <>
    <Accordion.Item value="item-1">
      <Accordion.Trigger>Item one</Accordion.Trigger>
      <Accordion.Content>
        <div className="pb-4">Content for item one.</div>
      </Accordion.Content>
    </Accordion.Item>
    <Accordion.Item value="item-2">
      <Accordion.Trigger>Item two</Accordion.Trigger>
      <Accordion.Content>
        <div className="pb-4">Content for item two.</div>
      </Accordion.Content>
    </Accordion.Item>
  </>
);

export const Default = meta.story({
  args: {
    type: "single",
    collapsible: true,
    defaultValue: "item-1",
    children: defaultChildren,
  },
});

export const ToggleItem = meta.story({
  name: "(Test) Toggle Item",
  args: {
    type: "single",
    collapsible: true,
    children: (
      <Accordion.Item value="item-1">
        <Accordion.Trigger>Details</Accordion.Trigger>
        <Accordion.Content>
          <div className="pb-4">Hidden details</div>
        </Accordion.Content>
      </Accordion.Item>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "Details" });

    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(canvas.queryByText("Hidden details")).not.toBeInTheDocument();

    await userEvent.click(trigger);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(canvas.getByText("Hidden details")).toBeVisible();

    await userEvent.click(trigger);
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => {
      expect(canvas.queryByText("Hidden details")).not.toBeInTheDocument();
    });
  },
});

export const NestedDetails = meta.story({
  name: "(Test) Nested Details",
  args: {
    type: "single",
    collapsible: true,
    children: (
      <Accordion.Item value="summary" variant="plain">
        <Accordion.Trigger variant="summary" size="sm">
          Available resources
        </Accordion.Trigger>
        <Accordion.Content>
          <Accordion type="single" collapsible>
            <Accordion.Item value="files" variant="plain">
              <Accordion.Trigger variant="compact" aria-label="Resource files">
                2 files
              </Accordion.Trigger>
              <Accordion.Content>
                <p>Resource file details</p>
              </Accordion.Content>
            </Accordion.Item>
          </Accordion>
        </Accordion.Content>
      </Accordion.Item>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const summary = canvas.getByRole("button", { name: "Available resources" });

    await expect(summary).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(summary);

    const files = canvas.getByRole("button", { name: "Resource files" });
    await expect(files).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(files);
    await expect(files).toHaveAttribute("aria-expanded", "true");
    await expect(canvas.getByText("Resource file details")).toBeVisible();

    await userEvent.click(summary);
    await expect(summary).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => {
      expect(
        canvas.queryByText("Resource file details"),
      ).not.toBeInTheDocument();
    });
  },
});
