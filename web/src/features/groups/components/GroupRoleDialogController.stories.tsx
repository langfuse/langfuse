import { PlusIcon } from "@langfuse/icons";
import { type Role } from "@langfuse/shared";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { Button } from "@/src/components/design-system/Button/Button";
import { MultiSelectInput } from "@/src/components/design-system/MultiSelectInput/MultiSelectInput";

import { type GroupMember } from "./GroupMemberList";
import { GroupRoleDialogController } from "./GroupRoleDialogController";

const meta = preview.meta({
  component: GroupRoleDialogController,
  parameters: { layout: "centered" },
});

const member = (name: string): GroupMember => ({
  userId: name.toLowerCase().replaceAll(" ", "-"),
  name,
  email: `${name.toLowerCase().replaceAll(" ", ".")}@example.com`,
  image: null,
});

const mixedMembers = [
  "Demo User",
  "Ada Lovelace",
  "Grace Hopper",
  "Alan Turing",
  "Katherine Johnson",
  "Mary Jackson",
].map(member);

const firstNames = [
  "Maya",
  "Daniel",
  "Priya",
  "Jonas",
  "Aiko",
  "Samuel",
  "Lena",
  "Chloe",
];
const lastNames = ["Okafor", "Reyes", "Raman", "Lindqvist", "Tanaka"];

const manyMembers = firstNames.flatMap((firstName) =>
  lastNames.map((lastName) => member(`${firstName} ${lastName}`)),
);

const dialogArgs = (
  overrides: Partial<Parameters<typeof GroupRoleDialogController>[0]> = {},
) => ({
  level: "organization" as const,
  groupName: "Customer Support",
  groupHref: "/organization/org-1/settings/groups?group=group-1",
  memberCount: mixedMembers.length,
  members: mixedMembers,
  orgRole: "VIEWER" as Role | null,
  isAiGatewayEnabled: true,
  onChange: fn(),
  children: (openDialog: () => void) => (
    <Button onClick={openDialog} text="Open group role" />
  ),
  ...overrides,
});

const openDialog = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  const body = within(canvasElement.ownerDocument.body);
  await userEvent.click(
    canvas.getByRole("button", { name: "Open group role" }),
  );
  const dialog = await body.findByRole("dialog");
  // The dialog fades in, so wait for it to finish appearing.
  await waitFor(() => expect(dialog).toBeVisible());
  return { body, dialog: within(dialog) };
};

const pickRole = async (
  { body, dialog }: Awaited<ReturnType<typeof openDialog>>,
  name: RegExp,
) => {
  await userEvent.click(dialog.getByRole("combobox"));
  await userEvent.click(await body.findByRole("option", { name }));
};

export const Default = meta.story({
  args: dialogArgs(),
});

export const WithMemberManagement = meta.story({
  args: dialogArgs({
    membersToolbar: (
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <MultiSelectInput
            aria-label="Add members"
            value={[]}
            options={[{ value: "ada", label: "Ada Lovelace" }]}
            onValueChange={fn()}
            placeholder="Select organization members"
            selectedLabel="1 member selected"
            searchPlaceholder="Search members"
            emptyMessage="No more organization members to add"
          />
        </div>
        <Button icon={PlusIcon} text="Add" disabled />
      </div>
    ),
    onRemoveMember: fn(),
    roleFootnote: "It also has roles in 2 projects.",
  }),
});

export const TestRemoveMember = meta.story({
  name: "(Test) Removing a member reports who to remove",
  args: WithMemberManagement.input.args,
  play: async ({ args, canvasElement }) => {
    const { dialog } = await openDialog(canvasElement);
    await userEvent.click(
      dialog.getByRole("button", { name: "Remove Grace Hopper from group" }),
    );
    await expect(args.onRemoveMember).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "grace-hopper" }),
    );
    // Emails tell apart members with the same name.
    await expect(dialog.getByText("grace.hopper@example.com")).toBeVisible();
  },
});

export const SyncedFromIdentityProvider = meta.story({
  args: dialogArgs({
    groupName: "Platform Engineering",
    isScimManaged: true,
    orgRole: "ADMIN",
  }),
});

export const ProjectLevel = meta.story({
  args: dialogArgs({
    level: "project",
    groupName: "llm-app-maintainers",
    groupHref: "/organization/org-1/settings/groups?group=group-1",
    projectName: "llm-app",
    memberCount: 17,
    members: undefined,
    orgRole: "VIEWER",
    projectRole: "MEMBER",
    grantableRoles: ["NONE", "VIEWER", "MEMBER", "ADMIN"],
    isAiGatewayEnabled: false,
  }),
});

export const EmptyGroup = meta.story({
  args: dialogArgs({
    groupName: "invited-contractors",
    memberCount: 0,
    members: [],
    orgRole: null,
  }),
});

export const LargeGroup = meta.story({
  args: dialogArgs({
    groupName: "Platform Engineering",
    memberCount: manyMembers.length,
    members: manyMembers,
    orgRole: "MEMBER",
  }),
});

export const AiGatewayRole = meta.story({
  args: dialogArgs({
    groupName: "gateway-users",
    orgRole: "AI_GATEWAY",
  }),
});

export const CannotChangeRole = meta.story({
  args: dialogArgs({
    disabledReason: "You do not have permission to manage groups",
  }),
});

export const TestPermissionsFollowPickedRole = meta.story({
  name: "(Test) The permissions link follows the picked role before saving",
  args: dialogArgs(),
  play: async ({ canvasElement }) => {
    const opened = await openDialog(canvasElement);
    const { dialog } = opened;

    await expect(
      dialog.getByRole("button", { name: "View 30 permissions" }),
    ).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Save" })).toBeDisabled();
    // Members read A to Z, whatever order they arrive in.
    const names = within(dialog.getByRole("list", { name: "Members" }))
      .getAllByRole("listitem")
      .map((item) => item.textContent);
    await expect(names[0]).toContain("Ada Lovelace");
    await expect(names[5]).toContain("Mary Jackson");

    await pickRole(opened, /^Admin/);

    await waitFor(() =>
      expect(
        dialog.getByRole("button", { name: "View 86 permissions" }),
      ).toBeVisible(),
    );
    await expect(dialog.getByRole("button", { name: "Save" })).toBeEnabled();
  },
});

export const TestAiGatewayKeepsOwnRole = meta.story({
  name: "(Test) AI Gateway says it adds to each member's existing role",
  args: dialogArgs(),
  play: async ({ canvasElement }) => {
    const opened = await openDialog(canvasElement);
    const { dialog } = opened;

    await pickRole(opened, /^AI Gateway/);

    await waitFor(() =>
      expect(
        dialog.getByText(
          "Adds AI Gateway access on top of each member's existing role.",
        ),
      ).toBeVisible(),
    );
  },
});

export const TestSyncedGroupNamesItsSource = meta.story({
  name: "(Test) A synced group says where its members are managed",
  args: SyncedFromIdentityProvider.input.args,
  play: async ({ canvasElement }) => {
    const { dialog } = await openDialog(canvasElement);
    await expect(
      dialog.getByText("Members managed in your identity provider"),
    ).toBeVisible();
    await expect(dialog.queryByRole("button", { name: /^Remove / })).toBeNull();
  },
});

export const TestProjectLevelPreviewsPickedRole = meta.story({
  name: "(Test) A project role previews what the group gives on the project",
  args: dialogArgs({
    level: "project",
    groupName: "llm-app-maintainers",
    groupHref: "/organization/org-1/settings/groups?group=group-1",
    projectName: "llm-app",
    memberCount: 17,
    members: undefined,
    orgRole: "VIEWER",
    projectRole: "MEMBER",
    grantableRoles: ["NONE", "VIEWER", "MEMBER", "ADMIN"],
    isAiGatewayEnabled: false,
  }),
  play: async ({ canvasElement }) => {
    const opened = await openDialog(canvasElement);
    const { dialog } = opened;

    await expect(
      dialog.getByRole("heading", { name: "Project access in llm-app for" }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("link", { name: "llm-app-maintainers" }),
    ).toHaveAttribute(
      "href",
      "/organization/org-1/settings/groups?group=group-1",
    );
    const picker = dialog.getByRole("combobox", { name: "Role in llm-app" });
    await expect(picker).toHaveTextContent("Member");

    await expect(
      dialog.getByRole("button", { name: "View 62 permissions" }),
    ).toBeVisible();

    // The organization role's own row is the "no project role" choice.
    await pickRole(opened, /^Viewer/);
    await waitFor(() =>
      expect(picker).toHaveTextContent("Viewer · from organization"),
    );
    await expect(
      dialog.getByRole("button", { name: "View 30 permissions" }),
    ).toBeVisible();
    // Without the full member list there is no list at all.
    await expect(dialog.queryByRole("list", { name: "Members" })).toBeNull();
  },
});

export const ProjectLevelWithMembers = meta.story({
  args: dialogArgs({
    level: "project",
    groupName: "Customer Support",
    projectName: "llm-app",
    memberCount: 3,
    members: ["Demo User 2", "Lena Hoffmann", "Chloe Bennett"].map(member),
    orgRole: "VIEWER",
    projectRole: null,
    grantableRoles: ["NONE", "VIEWER", "MEMBER", "ADMIN"],
    isAiGatewayEnabled: false,
  }),
});
