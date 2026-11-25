import { type Role } from "@langfuse/shared";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { Button } from "@/src/components/design-system/Button/Button";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { rolePermissionCountLabel } from "@/src/features/rbac/components/RolePermissionList";

import { type GroupMember } from "@/src/features/groups/groupMember";
import { GroupMembersSection } from "./GroupMembersSection";
import { GroupRoleDialog } from "./GroupRoleDialog";

type GroupRoleDialogProps = Omit<
  Parameters<typeof GroupRoleDialog>[0],
  "onDone" | "children"
> & {
  members?: GroupMember[];
  canManageMembers?: boolean;
  onRemoveMember?: (member: GroupMember) => void;
};

/** Opens the dialog from a button and lists the members under the role, as the pages do. */
function GroupRoleDialogDemo({
  members,
  canManageMembers = false,
  onRemoveMember,
  ...props
}: GroupRoleDialogProps) {
  return (
    <DialogController
      renderDialog={({ closeDialog }) => (
        <GroupRoleDialog {...props} onDone={closeDialog}>
          {members && (
            <GroupMembersSection
              members={members}
              onRemove={canManageMembers ? onRemoveMember : undefined}
              addMembers={
                canManageMembers
                  ? {
                      candidates: [{ value: "ada", label: "Ada Lovelace" }],
                      isLoadingCandidates: false,
                      isAdding: false,
                      onAdd: fn(() => Promise.resolve()),
                    }
                  : undefined
              }
            />
          )}
        </GroupRoleDialog>
      )}
    >
      {({ openDialog }) => (
        <Button onClick={() => openDialog()} text="Open group" />
      )}
    </DialogController>
  );
}

const meta = preview.meta({
  component: GroupRoleDialogDemo,
  parameters: { layout: "centered" },
});

const member = (name: string): GroupMember => ({
  userId: name.toLowerCase().replaceAll(" ", "-"),
  name,
  email: `${name.toLowerCase().replaceAll(" ", ".")}@example.com`,
  image: null,
});

const members = [
  "Demo User",
  "Ada Lovelace",
  "Grace Hopper",
  "Alan Turing",
  "Katherine Johnson",
  "Mary Jackson",
].map(member);

const openDialog = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  const body = within(canvasElement.ownerDocument.body);
  await userEvent.click(canvas.getByRole("button", { name: "Open group" }));
  const dialog = await body.findByRole("dialog");
  await waitFor(() => expect(dialog).toBeVisible());
  return { body, dialog: within(dialog) };
};

const pickRole = async (
  { body, dialog }: Awaited<ReturnType<typeof openDialog>>,
  name: RegExp,
) => {
  await userEvent.click(dialog.getByRole("combobox", { name: /^Role in/ }));
  await userEvent.click(await body.findByRole("option", { name }));
};

const viewPermissions = (role: Role) =>
  `View ${rolePermissionCountLabel(role)}`;

export const Default = meta.story({
  args: {
    level: "organization",
    groupName: "Customer Support",
    memberCount: members.length,
    members,
    canManageMembers: true,
    onRemoveMember: fn(),
    orgRole: "VIEWER",
    isAiGatewayEnabled: true,
    roleFootnote: "It also has roles in 2 projects.",
    onChange: fn(),
  },
});

export const SyncedFromIdentityProvider = meta.story({
  args: {
    ...Default.input.args,
    groupName: "Platform Engineering",
    isScimManaged: true,
    canManageMembers: false,
    orgRole: "ADMIN",
  },
});

export const ProjectLevel = meta.story({
  args: {
    level: "project",
    groupName: "llm-app-maintainers",
    projectName: "llm-app",
    memberCount: members.length,
    members,
    orgRole: "VIEWER",
    projectRole: "MEMBER",
    grantableRoles: ["NONE", "VIEWER", "MEMBER", "ADMIN"],
    onChange: fn(),
  },
});

export const CannotChangeRole = meta.story({
  args: {
    ...Default.input.args,
    canManageMembers: false,
    disabledReason: "You do not have permission to manage groups",
  },
});

export const TestPermissionsFollowPickedRole = meta.story({
  name: "(Test) The permissions link follows the picked role before saving",
  args: Default.input.args,
  play: async ({ args, canvasElement }) => {
    const opened = await openDialog(canvasElement);
    const { dialog } = opened;

    await expect(
      dialog.getByRole("button", { name: viewPermissions("VIEWER") }),
    ).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Save" })).toBeDisabled();
    const names = within(dialog.getByRole("list", { name: "Members" }))
      .getAllByRole("listitem")
      .map((item) => item.textContent);
    await expect(names[0]).toContain("Ada Lovelace");
    await expect(names[5]).toContain("Mary Jackson");

    await pickRole(opened, /^Admin/);

    await waitFor(() =>
      expect(
        dialog.getByRole("button", { name: viewPermissions("ADMIN") }),
      ).toBeVisible(),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await expect(args.onChange).toHaveBeenCalledWith("ADMIN");
  },
});

export const TestAiGatewayKeepsOwnRole = meta.story({
  name: "(Test) AI Gateway says it adds to each member's existing role",
  args: Default.input.args,
  play: async ({ canvasElement }) => {
    const opened = await openDialog(canvasElement);
    await pickRole(opened, /^AI Gateway/);
    await waitFor(() =>
      expect(
        opened.dialog.getByText(
          /Adds AI Gateway access on top of each member's existing role\./,
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

export const TestRemoveMember = meta.story({
  name: "(Test) Removing a member reports who to remove",
  args: Default.input.args,
  play: async ({ args, canvasElement }) => {
    const { dialog } = await openDialog(canvasElement);
    await expect(dialog.getByText("grace.hopper@example.com")).toBeVisible();
    await userEvent.click(
      dialog.getByRole("button", { name: "Remove Grace Hopper from group" }),
    );
    await expect(args.onRemoveMember).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "grace-hopper" }),
    );
  },
});

export const TestProjectRoleBelowOrganizationRoleIsUnavailable = meta.story({
  name: "(Test) On a project, roles the organization role already gives are unavailable",
  args: ProjectLevel.input.args,
  play: async ({ canvasElement }) => {
    const { body, dialog } = await openDialog(canvasElement);
    await expect(
      dialog.getByRole("heading", { name: "Project access" }),
    ).toBeVisible();
    await userEvent.click(
      dialog.getByRole("combobox", { name: "Role in llm-app" }),
    );
    const viewer = await body.findByRole("option", { name: /^Viewer/ });
    await expect(viewer).toHaveAttribute("aria-disabled", "true");
    await expect(viewer).toHaveTextContent(
      "llm-app-maintainers already gives Viewer in the organization",
    );
  },
});

export const TestMatchingProjectRoleCanBeCleared = meta.story({
  name: "(Test) A project role equal to the organization role can be cleared",
  args: {
    ...ProjectLevel.input.args,
    orgRole: "ADMIN",
    projectRole: "ADMIN",
  },
  play: async ({ args, canvasElement }) => {
    const opened = await openDialog(canvasElement);
    const { dialog } = opened;
    await expect(dialog.getByRole("button", { name: "Save" })).toBeDisabled();

    await pickRole(opened, /^Inherit from organization/);

    await waitFor(() =>
      expect(dialog.getByRole("button", { name: "Save" })).toBeEnabled(),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await expect(args.onChange).toHaveBeenCalledWith(null);
  },
});
