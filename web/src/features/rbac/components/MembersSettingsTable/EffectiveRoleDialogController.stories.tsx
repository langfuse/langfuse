import { type Role } from "@langfuse/shared";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import preview from "../../../../../.storybook/preview";
import { Button } from "@/src/components/design-system/Button/Button";
import { rolePermissionCountLabel } from "@/src/features/rbac/components/RolePermissionList";

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

const viewPermissions = (role: Role) =>
  `View ${rolePermissionCountLabel(role)}`;

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
    projectName: onProject ? "llm-app" : undefined,
    canSeeOrgGroups,
    canSeeProjectGroups: canSeeOrgGroups,
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
  await waitFor(() => expect(dialog).toBeVisible());
  return { body, dialog: within(dialog) };
};

const markedRows = (dialog: ReturnType<typeof within>) =>
  dialog
    .queryAllByRole("img", { name: "This role applies", hidden: true })
    .map((marker: HTMLElement) => marker.closest("li")?.textContent);

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

export const LongGroupName = meta.story({
  args: dialogArgs({
    orgRole: "VIEWER",
    groupRoles: [
      {
        ...platformAdmins,
        groupName: "customer-support-assistant-production-europe-west-admins",
      },
      support,
    ],
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
  args: InGroups.input.args,
  play: async ({ canvasElement }) => {
    const { body, dialog } = await openDialog(canvasElement);
    await expect(
      dialog.getByText(/Anything below Admin has no effect/),
    ).toBeVisible();
    await expect(
      dialog.getByRole("link", { name: /platform-admins/ }),
    ).toHaveAttribute(
      "href",
      "/organization/org-1/settings/groups?group=group-admins",
    );

    await userEvent.click(dialog.getByRole("combobox"));
    const viewer = await body.findByRole("option", { name: /^Viewer/ });
    await expect(viewer).toHaveAttribute("aria-disabled", "true");
    await expect(viewer).toHaveTextContent(
      "platform-admins already gives Admin",
    );
    // Admin already includes every AI Gateway permission.
    await expect(
      await body.findByRole("option", { name: /^AI Gateway/ }),
    ).toHaveAttribute("aria-disabled", "true");
  },
});

export const TestGroupHoverSummarizesGroup = meta.story({
  name: "(Test) Hovering a group name summarizes the group",
  args: InGroups.input.args,
  play: async ({ canvasElement }) => {
    const { body, dialog } = await openDialog(canvasElement);
    const group = dialog.getByRole("link", { name: /Support/ });
    await expect(group).toHaveAttribute(
      "href",
      "/organization/org-1/settings/groups?group=group-support",
    );

    await userEvent.hover(group);
    await waitFor(
      () =>
        expect(
          body.getByText("Members managed in your identity provider"),
        ).toBeVisible(),
      { timeout: 2000 },
    );
    await expect(
      body.getByRole("link", { name: "Open group" }),
    ).toHaveAttribute(
      "href",
      "/organization/org-1/settings/groups?group=group-support",
    );
  },
});

export const TestGroupsWithoutAccessAreNotLinks = meta.story({
  name: "(Test) Without access to the Groups page the group names are not links",
  args: dialogArgs({
    orgRole: "MEMBER",
    groupRoles: [platformAdmins, support],
    canSeeOrgGroups: false,
  }),
  play: async ({ canvasElement }) => {
    const { dialog } = await openDialog(canvasElement);
    await expect(dialog.getByTitle("platform-admins")).toBeVisible();
    await expect(
      dialog.queryByRole("link", { name: /platform-admins/ }),
    ).toBeNull();
  },
});

export const TestMarkerFollowsDirectRole = meta.story({
  name: "(Test) The marker moves as the direct role changes",
  args: InGroups.input.args,
  play: async ({ canvasElement }) => {
    const { body, dialog } = await openDialog(canvasElement);
    await expect(markedRows(dialog)).toEqual(["platform-adminsAdmin"]);
    await expect(
      dialog.getByRole("button", { name: viewPermissions("ADMIN") }),
    ).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Save" })).toBeDisabled();

    await userEvent.click(dialog.getByRole("combobox"));
    await userEvent.click(await body.findByRole("option", { name: /^Owner/ }));

    await waitFor(() =>
      expect(markedRows(dialog)).toEqual(["Directly assignedOwner"]),
    );
    await expect(
      dialog.getByRole("button", { name: viewPermissions("OWNER") }),
    ).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Save" })).toBeEnabled();
  },
});

export const TestNoMarkerWithoutGroups = meta.story({
  name: "(Test) A member in no group gets no marker",
  args: InNoGroup.input.args,
  play: async ({ canvasElement }) => {
    const { dialog } = await openDialog(canvasElement);
    await expect(markedRows(dialog)).toEqual([]);
    await expect(dialog.getByRole("heading", { name: "Access" })).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: viewPermissions("MEMBER") }),
    ).toBeVisible();
  },
});

export const TestOrganizationRoleOnProject = meta.story({
  name: "(Test) The organization role stays listed when a project role replaces it",
  args: dialogArgs({
    orgRole: "VIEWER",
    groupRoles: [platformAdmins],
    onProject: true,
  }),
  play: async ({ canvasElement }) => {
    const { body, dialog } = await openDialog(canvasElement);
    await expect(dialog.getByText("Organization role")).toBeVisible();
    await expect(dialog.getByRole("combobox")).toHaveTextContent("None");
    await expect(markedRows(dialog)).toEqual(["platform-adminsAdmin"]);

    await userEvent.click(dialog.getByRole("combobox"));
    await userEvent.click(await body.findByRole("option", { name: /^Admin/ }));

    // A tie marks every row that gives the role.
    await waitFor(() =>
      expect(markedRows(dialog)).toEqual([
        "platform-adminsAdmin",
        "Directly assignedAdmin",
      ]),
    );
    await expect(dialog.getByText("Organization role")).toBeVisible();
  },
});

export const TestMarkerNeedsTwoRoles = meta.story({
  name: "(Test) The marker shows once a project role joins the organization role",
  args: dialogArgs({ orgRole: "VIEWER", groupRoles: [], onProject: true }),
  play: async ({ canvasElement }) => {
    const { body, dialog } = await openDialog(canvasElement);
    await expect(dialog.getByText("Organization role")).toBeVisible();
    await expect(markedRows(dialog)).toEqual([]);

    await userEvent.click(dialog.getByRole("combobox"));
    await userEvent.click(await body.findByRole("option", { name: /^Member/ }));

    await waitFor(() =>
      expect(markedRows(dialog)).toEqual(["Directly assignedMember"]),
    );
  },
});

export const TestProjectGroupLinksToProject = meta.story({
  name: "(Test) A group with a project role links to the project's Groups page",
  args: OnProject.input.args,
  play: async ({ canvasElement }) => {
    const { dialog } = await openDialog(canvasElement);
    await expect(
      dialog.getByRole("link", { name: /llm-app-maintainers/ }),
    ).toHaveAttribute(
      "href",
      "/project/project-1/settings/groups?group=group-maintainers",
    );
    await expect(dialog.getByRole("link", { name: /Support/ })).toHaveAttribute(
      "href",
      "/organization/org-1/settings/groups?group=group-support",
    );
  },
});
