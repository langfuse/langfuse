import { type Role } from "@langfuse/shared";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import preview from "../../../../../.storybook/preview";
import { Button } from "@/src/components/design-system/Button/Button";

import {
  belowGroupFloor,
  EffectiveRoleDialogController,
  resolveEffectiveRole,
} from "./EffectiveRoleDialogController";
import { type MemberGroupRole } from "./MembersSettingsTable";

const meta = preview.meta({
  component: EffectiveRoleDialogController,
  parameters: { layout: "centered" },
});

const names = [
  "Demo User",
  "Demo User 2",
  "Ada Lovelace",
  "Grace Hopper",
  "Alan Turing",
];

const memberPreview = (count: number) =>
  names.slice(0, count).map((name, index) => ({
    userId: `member-${index}`,
    name,
    email: `${name.toLowerCase().replaceAll(" ", ".")}@example.com`,
    image: null,
  }));

const platformAdmins: MemberGroupRole = {
  groupId: "group-admins",
  groupName: "platform-admins",
  groupSource: "MANUAL",
  memberCount: 1,
  memberPreview: memberPreview(1),
  role: "ADMIN",
  level: "organization",
};

const support: MemberGroupRole = {
  groupId: "group-support",
  groupName: "Support",
  groupSource: "SCIM",
  memberCount: 8,
  memberPreview: memberPreview(5),
  role: "VIEWER",
  level: "organization",
};

const maintainers: MemberGroupRole = {
  groupId: "group-maintainers",
  groupName: "llm-app-maintainers",
  groupSource: "MANUAL",
  memberCount: 17,
  memberPreview: memberPreview(5),
  role: "MEMBER",
  level: "project",
};

const organizationRoles: Role[] = [
  "OWNER",
  "ADMIN",
  "MEMBER",
  "VIEWER",
  "AI_GATEWAY",
  "NONE",
];
const projectRoles: Role[] = ["OWNER", "ADMIN", "MEMBER", "VIEWER", "NONE"];

/** Builds the dialog's inputs the way the members table does. */
const dialogArgs = ({
  orgRole,
  projectRole,
  groupRoles,
  onProject = false,
  canSeeOrgGroups = true,
  disabledReason,
}: {
  orgRole: Role;
  projectRole?: Role;
  groupRoles: MemberGroupRole[];
  onProject?: boolean;
  canSeeOrgGroups?: boolean;
  disabledReason?: string;
}) => {
  const effective = resolveEffectiveRole({
    orgRole,
    projectRole,
    groupRoles,
    level: onProject ? "project" : "organization",
  });
  return {
    effective,
    orgRole,
    orgId: "org-1",
    projectId: onProject ? "project-1" : undefined,
    canSeeOrgSettings: true,
    canSeeOrgGroups,
    member: { name: "Demo User 2", email: "member@example.com" },
    editor: {
      roles: onProject ? projectRoles : organizationRoles,
      value: onProject ? (projectRole ?? "NONE") : orgRole,
      isProjectRole: onProject,
      disabledReason,
      optionDisabledReason: belowGroupFloor(effective, {
        allowNone: onProject,
      }),
      onChange: fn(),
    },
    children: (openDialog: () => void) => (
      <Button onClick={openDialog} text="Open role details" />
    ),
  };
};

const openDialog = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  const body = within(canvasElement.ownerDocument.body);
  await userEvent.click(
    canvas.getByRole("button", { name: "Open role details" }),
  );
  const dialog = await body.findByRole("dialog");
  // The dialog fades in, so wait for it to finish appearing.
  await waitFor(() => expect(dialog).toBeVisible());
  return { body, dialog: within(dialog) };
};

export const InGroups = meta.story({
  args: dialogArgs({
    orgRole: "MEMBER",
    groupRoles: [platformAdmins, support],
  }),
});

export const InNoGroup = meta.story({
  args: dialogArgs({ orgRole: "MEMBER", groupRoles: [] }),
});

export const OnProject = meta.story({
  args: dialogArgs({
    orgRole: "VIEWER",
    projectRole: "VIEWER",
    groupRoles: [support, maintainers],
    onProject: true,
  }),
});

export const WithoutAccessToGroups = meta.story({
  args: dialogArgs({
    orgRole: "MEMBER",
    groupRoles: [platformAdmins, support],
    canSeeOrgGroups: false,
  }),
});

export const CannotChangeRole = meta.story({
  args: dialogArgs({
    orgRole: "MEMBER",
    groupRoles: [platformAdmins],
    disabledReason:
      "You do not have permission to change roles in this organization.",
  }),
});

export const TestRolesBelowGroupFloor = meta.story({
  name: "(Test) Roles below what a group gives are unavailable",
  args: dialogArgs({
    orgRole: "MEMBER",
    groupRoles: [platformAdmins, support],
  }),
  play: async ({ canvasElement }) => {
    const { body, dialog } = await openDialog(canvasElement);
    await userEvent.click(dialog.getByRole("combobox"));

    const viewer = await body.findByRole("option", { name: /Viewer/ });
    await expect(viewer).toHaveAttribute("aria-disabled", "true");
    await expect(viewer).toHaveTextContent(
      "platform-admins already gives Admin",
    );
  },
});

export const TestGroupChipSummarizesGroup = meta.story({
  name: "(Test) Hovering a group chip summarizes the group",
  args: dialogArgs({
    orgRole: "MEMBER",
    groupRoles: [platformAdmins, support],
  }),
  play: async ({ canvasElement }) => {
    const { body, dialog } = await openDialog(canvasElement);
    const chip = dialog.getByRole("link", { name: /Support/ });
    await expect(chip).toHaveAttribute(
      "href",
      "/organization/org-1/settings/groups?group=group-support",
    );

    await userEvent.hover(chip);
    await waitFor(
      () =>
        expect(
          body.getByText("Managed in your identity provider"),
        ).toBeVisible(),
      { timeout: 2000 },
    );
    await expect(body.getByText("+3 more members")).toBeVisible();
  },
});

export const TestChipsWithoutGroupsAccess = meta.story({
  name: "(Test) Without access to the Groups page the chips are not links",
  args: dialogArgs({
    orgRole: "MEMBER",
    groupRoles: [platformAdmins, support],
    canSeeOrgGroups: false,
  }),
  play: async ({ canvasElement }) => {
    const { dialog } = await openDialog(canvasElement);
    // The chip is still there, by its label.
    await expect(dialog.getByTitle("platform-admins")).toBeVisible();
    await expect(
      dialog.queryByRole("link", { name: /platform-admins/ }),
    ).toBeNull();
  },
});
