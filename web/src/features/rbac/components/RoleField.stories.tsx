import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { RoleField } from "./RoleField";

const meta = preview.meta({
  component: RoleField,
  parameters: { layout: "centered" },
});

export const Default = meta.story({
  args: {
    "aria-label": "Role",
    roles: ["ADMIN", "MEMBER", "VIEWER", "NONE"],
    value: "VIEWER",
    onChange: fn(),
  },
});

export const Inline = meta.story({
  args: {
    ...Default.input.args,
    variant: "inline",
  },
});

export const Disabled = meta.story({
  args: {
    ...Default.input.args,
    disabled: true,
  },
});

export const TestTriggerShowsOnlyRoleName = meta.story({
  name: "(Test) The trigger shows only the role name",
  args: {
    ...Default.input.args,
    noneLabel: "Inherit from organization",
    noneDescription: "Keep the organization role on this project.",
    value: "NONE",
  },
  play: async ({ args, canvasElement }) => {
    const trigger = within(canvasElement).getByRole("combobox", {
      name: "Role",
    });
    await expect(trigger).toHaveTextContent(/^Inherit from organization$/);

    await userEvent.click(trigger);
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await body.findByRole("option", { name: /^Inherit from organization/ }),
    ).toHaveTextContent("Keep the organization role on this project.");
    await userEvent.click(await body.findByRole("option", { name: /^Admin/ }));
    await expect(args.onChange).toHaveBeenCalledWith("ADMIN");
  },
});
