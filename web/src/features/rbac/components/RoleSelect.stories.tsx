import { useState } from "react";
import { type Role } from "@langfuse/shared";
import { expect, userEvent, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { RoleSelect } from "./RoleSelect";
import { roleDisplay } from "./roleDisplay";

const organizationRoles: Role[] = [
  "OWNER",
  "ADMIN",
  "MEMBER",
  "VIEWER",
  "AI_GATEWAY",
  "NONE",
];

type RoleSelectProps = Parameters<typeof RoleSelect<Role>>[0];

/** Holds the picked role, since the select is controlled. */
function StatefulRoleSelect(props: Omit<RoleSelectProps, "onValueChange">) {
  const [value, setValue] = useState(props.value);
  return (
    <div className="flex w-80 flex-col gap-1.5">
      <RoleSelect {...props} value={value} onValueChange={setValue} />
    </div>
  );
}

const meta = preview.meta({
  component: StatefulRoleSelect,
  parameters: { layout: "centered" },
});

export const Default = meta.story({
  args: { roles: organizationRoles, value: "MEMBER" },
});

export const Detailed = meta.story({
  args: {
    roles: organizationRoles,
    value: "MEMBER",
    variant: "detailed",
    menu: "trigger",
  },
});

export const WithUnavailableRoles = meta.story({
  args: {
    roles: organizationRoles,
    value: "MEMBER",
    menu: "trigger",
    optionDisabledReason: (role: Role) =>
      role === "VIEWER" || role === "NONE"
        ? "Platform Engineering already gives Admin"
        : undefined,
  },
});

export const WithOwnNames = meta.story({
  args: {
    roles: ["ADMIN", "MEMBER", "VIEWER", "NONE"],
    value: "NONE",
    menu: "trigger",
    valueLabel: "Same as organization · Viewer",
    display: (role) =>
      role === "NONE"
        ? {
            name: "Same as organization",
            description: "Keep the organization role (Viewer) on this project.",
          }
        : roleDisplay(role),
  },
});

export const TestUnavailableRoleCannotBePicked = meta.story({
  name: "(Test) An unavailable role shows its reason and cannot be picked",
  args: WithUnavailableRoles.input.args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const picker = canvas.getByRole("combobox");
    await userEvent.click(picker);

    const viewer = await body.findByRole("option", { name: /Viewer/ });
    await expect(viewer).toHaveAttribute("aria-disabled", "true");
    await expect(viewer).toHaveTextContent(
      "Platform Engineering already gives Admin",
    );
    await userEvent.click(within(viewer).getByText("Viewer"));
    await expect(picker).toHaveTextContent("Member");

    await userEvent.click(await body.findByRole("option", { name: /^Admin/ }));
    await expect(picker).toHaveTextContent("Admin");
  },
});
