import { expect, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { Form } from "../Form/Form";
import { Input } from "../Input/Input";
import { FormCompositeField } from "./FormCompositeField";

const meta = preview.meta({
  component: FormCompositeField,
  args: {
    label: "Headers",
    children: (
      <div className="grid grid-cols-2 gap-2">
        <Input aria-label="Header name" placeholder="Header name" />
        <Input aria-label="Header value" placeholder="Value" />
      </div>
    ),
  },
  render: (args) => <Form.CompositeField {...args} />,
});

export const Default = meta.story({
  name: "(Test) Compound field",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const group = within(canvas.getByRole("group", { name: "Headers" }));

    await expect(
      group.getByRole("textbox", { name: "Header name" }),
    ).toBeVisible();
    await expect(
      group.getByRole("textbox", { name: "Header value" }),
    ).toBeVisible();
  },
});

export const WithDescription = meta.story({
  name: "(Test) Group description",
  args: {
    description: "Custom headers included in the request.",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("group", { name: "Headers" }),
    ).toHaveAccessibleDescription("Custom headers included in the request.");
  },
});
