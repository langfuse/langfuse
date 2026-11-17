import { useCallback, useId, useMemo, useState } from "react";
import {
  AlertCircle,
  Lock,
  PencilLine,
  PlusIcon,
  Trash,
  UserPlus,
  Users,
} from "@langfuse/icons";
import { type Role } from "@langfuse/shared";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/design-system/Button/Button";
import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { Input } from "@/src/components/design-system/Input/Input";
import { MultiSelectInput } from "@/src/components/design-system/MultiSelectInput/MultiSelectInput";
import { type TableProps } from "@/src/components/design-system/table/Table";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import Header from "@/src/components/layouts/header";
import { SettingsTable } from "@/src/components/SettingsTable/SettingsTable";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { GroupMemberStack } from "@/src/features/groups/components/GroupMemberStack";
import { GroupName } from "@/src/features/groups/components/GroupName";
import { GroupSourceLabel } from "@/src/features/groups/components/GroupSourceLabel";
import {
  GROUP_SOURCE_DISPLAY,
  isScimManaged,
  SCIM_LOCK_LABEL,
} from "@/src/features/groups/groupSource";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { RoleSelect } from "@/src/features/rbac/components/RoleSelect";
import { orderedRoles } from "@/src/features/rbac/constants/orderedRoles";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { api, type RouterOutputs } from "@/src/utils/api";

type Group = RouterOutputs["groups"]["list"][number];
type GroupMember = Group["members"][number];
type GroupMemberRow = GroupMember & { effectiveRole: string };
type GroupRole = "ADMIN" | "MEMBER" | "VIEWER";

// Groups never grant OWNER; NONE removes the group's org-wide role.
const ORG_GROUP_ROLES: Role[] = ["NONE", "VIEWER", "MEMBER", "ADMIN"];
const roleLabel = (role: string) =>
  role === "NONE" ? "None" : role.charAt(0) + role.slice(1).toLowerCase();
const NO_EDIT_REASON = {
  reason: "You do not have permission to manage groups",
};
const SCIM_LOCKED_REASON = {
  reason: "Synced from your identity provider. Change it there.",
};
const SCIM_DELETE_REASON = {
  reason: "Synced from your identity provider. Delete it there.",
};

/** Why a group's name or members cannot be edited, if they cannot. */
const editBlockedReason = (canEdit: boolean, group?: { source: string }) => {
  if (!canEdit) return NO_EDIT_REASON;
  if (group && isScimManaged(group)) return SCIM_LOCKED_REASON;
  return undefined;
};

/** Why a group cannot be deleted here, if it cannot. SCIM groups are deleted by the identity provider. */
const deleteBlockedReason = (canEdit: boolean, group: { source: string }) => {
  if (!canEdit) return NO_EDIT_REASON;
  if (isScimManaged(group)) return SCIM_DELETE_REASON;
  return undefined;
};

type GroupRow = {
  group: Group;
  displayName: string;
  source: string;
  externalId: string | null;
  memberCount: number;
  updatedAt: Date;
};

const toRow = (group: Group): GroupRow => ({
  group,
  displayName: group.displayName,
  source: GROUP_SOURCE_DISPLAY[group.source].label,
  externalId: group.externalId,
  memberCount: group.members.length,
  updatedAt: group.updatedAt,
});

// Groups come from SCIM or are created here. SCIM groups mirror the identity
// provider, so their name and members are read-only; their roles stay
// editable. Project roles are set in each project's settings, like project
// roles of members.
export function GroupsSettings({ orgId }: { orgId: string }) {
  const hasEntitlement = useHasEntitlement("admin-api");
  const hasAccess = useHasOrganizationAccess({
    organizationId: orgId,
    scope: "organizationMembers:read",
  });
  const canEdit = useHasOrganizationAccess({
    organizationId: orgId,
    scope: "organizationMembers:CUD",
  });

  const header = (
    <Header
      title="Groups"
      help={{
        description:
          "Groups are synced from your identity provider through SCIM or created here. Synced groups are locked: manage their name, members and deletion in your identity provider. A group's organization role adds to the roles its members already have and never lowers them. Project roles for groups are set in each project's settings.",
      }}
    />
  );

  if (!hasEntitlement) {
    return (
      <div>
        {header}
        <Alert icon={AlertCircle}>
          <Alert.Title>Not available</Alert.Title>
          <Alert.Description>
            SCIM provisioning is not available on your plan.
          </Alert.Description>
        </Alert>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div>
        {header}
        <Alert>
          <Alert.Title>Access Denied</Alert.Title>
          <Alert.Description>
            You do not have permission to view the members of this organization.
          </Alert.Description>
        </Alert>
      </div>
    );
  }

  return (
    <div>
      {header}
      <GroupsTable orgId={orgId} canEdit={canEdit} />
    </div>
  );
}

function groupColumns(
  orgId: string,
  canEdit: boolean,
): LangfuseColumnDef<GroupRow>[] {
  return [
    {
      accessorKey: "displayName",
      header: "Name",
      cell: ({ row }) => <GroupName group={row.original.group} />,
    },
    {
      accessorKey: "source",
      header: "Source",
      enableHiding: true,
      headerTooltip: {
        description:
          "SCIM: synced from your identity provider, so its name and members are managed there. Langfuse: created here by an admin.",
      },
      size: 120,
      cell: ({ row }) => (
        <GroupSourceLabel source={row.original.group.source} />
      ),
    },
    createTextTableColumn<GroupRow>({
      accessorKey: "externalId",
      header: "IdP ID",
      nullValue: "-",
      enableHiding: true,
      defaultHidden: true,
    }),
    {
      accessorKey: "memberCount",
      header: "Members",
      size: 180,
      cell: ({ row }) => (
        <GroupMemberStack members={row.original.group.members} />
      ),
    },
    {
      accessorKey: "orgRole",
      header: "Organization role",
      headerTooltip: {
        description:
          "Every member of the group gets this role in the organization, on top of their own role.",
        href: "https://langfuse.com/docs/administration/rbac",
      },
      size: 160,
      cell: ({ row }) => (
        <GroupOrgRoleSelect
          orgId={orgId}
          group={row.original.group}
          canEdit={canEdit}
        />
      ),
    },
    createDateTableColumn<GroupRow>({
      accessorKey: "updatedAt",
      header: "Updated",
      enableHiding: true,
      defaultHidden: true,
      mode: "relative",
    }),
  ];
}

function GroupsTable({ orgId, canEdit }: { orgId: string; canEdit: boolean }) {
  const groups = api.groups.list.useQuery({ orgId });
  const [search, setSearch] = useState("");

  const data = useMemo<TableProps<GroupRow>["data"]>(() => {
    if (groups.isPending) return { status: "loading" };
    if (groups.error) return { status: "error", error: groups.error.message };
    const query = search.trim().toLowerCase();
    return {
      status: "success",
      data: groups.data
        .filter(
          (group) =>
            !query ||
            group.displayName.toLowerCase().includes(query) ||
            group.externalId?.toLowerCase().includes(query),
        )
        .map(toRow),
    };
  }, [groups.isPending, groups.error, groups.data, search]);

  const columns = useMemo(() => groupColumns(orgId, canEdit), [orgId, canEdit]);

  return (
    <CreateGroupDialogController orgId={orgId}>
      {(openCreate) => (
        <GroupMembersDialogController orgId={orgId} canEdit={canEdit}>
          {(openMembers) => (
            <RenameGroupDialogController orgId={orgId}>
              {(openRename) => (
                <DeleteGroupDialogController orgId={orgId}>
                  {(openDelete) => (
                    <GroupsSettingsTable
                      columns={columns}
                      data={data}
                      canEdit={canEdit}
                      search={search}
                      onSearchChange={setSearch}
                      onCreate={openCreate}
                      onMembers={openMembers}
                      onRename={openRename}
                      onDelete={openDelete}
                    />
                  )}
                </DeleteGroupDialogController>
              )}
            </RenameGroupDialogController>
          )}
        </GroupMembersDialogController>
      )}
    </CreateGroupDialogController>
  );
}

function GroupsSettingsTable({
  columns,
  data,
  canEdit,
  search,
  onSearchChange,
  onCreate,
  onMembers,
  onRename,
  onDelete,
}: {
  columns: LangfuseColumnDef<GroupRow>[];
  data: TableProps<GroupRow>["data"];
  canEdit: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  onCreate: () => void;
  onMembers: (group: Group) => void;
  onRename: (group: Group) => void;
  onDelete: (group: Group) => void;
}) {
  const actions = useCallback<NonNullable<TableProps<GroupRow>["actions"]>>(
    ({ group }) => [
      {
        id: "members",
        type: "item",
        title:
          canEdit && !isScimManaged(group) ? "Manage members" : "View members",
        icon: Users,
        onClick: () => onMembers(group),
      },
      {
        id: "rename",
        type: "item",
        title: "Rename",
        icon: PencilLine,
        disabled: editBlockedReason(canEdit, group),
        onClick: () => onRename(group),
      },
      {
        id: "delete",
        type: "item",
        title: "Delete group",
        icon: Trash,
        variant: "destructive",
        disabled: deleteBlockedReason(canEdit, group),
        onClick: () => onDelete(group),
      },
    ],
    [canEdit, onMembers, onRename, onDelete],
  );

  return (
    <SettingsTable
      tableName="organization groups"
      columns={columns}
      data={data}
      actions={actions}
      onRowClick={(row) => onMembers(row.group)}
      getRowLabel={(row) => row.displayName}
      columnVisibilityKey="groupsColumnVisibilityOrg"
      columnOrderKey="groupsColumnOrderOrg"
      noResultsMessage="No groups yet. Push groups from your identity provider or create one here."
      search={{
        value: search,
        placeholder: "Search name or IdP ID",
        onChange: onSearchChange,
      }}
      toolbarActions={
        canEdit
          ? [
              {
                id: "create-group",
                label: "New group",
                variant: "secondary",
                icon: <PlusIcon size="base" aria-hidden="true" />,
                onClick: onCreate,
              },
            ]
          : undefined
      }
    />
  );
}

/** Saves on change, like the organization role on the Members page. */
function GroupOrgRoleSelect({
  orgId,
  group,
  canEdit,
}: {
  orgId: string;
  group: Group;
  canEdit: boolean;
}) {
  const utils = api.useUtils();
  const setOrgRole = api.groups.setOrgRole.useMutation({
    onSuccess: ({ role }) => {
      utils.groups.invalidate().catch(() => undefined);
      utils.members.invalidate().catch(() => undefined);
      showSuccessToast({
        operation: "group_roles.update",
        title: "Group role saved",
        description: role
          ? `${group.displayName} is now ${roleLabel(role)} in this organization`
          : `${group.displayName} no longer has an organization role`,
        duration: 2000,
      });
    },
  });
  return (
    <RoleSelect
      roles={ORG_GROUP_ROLES}
      value={(group.orgRole as Role | null) ?? "NONE"}
      canManageOwnership={false}
      size="compact"
      disabled={!canEdit || setOrgRole.isPending}
      onValueChange={(role) =>
        setOrgRole.mutate({
          orgId,
          groupId: group.id,
          role: role === "NONE" ? null : (role as GroupRole),
        })
      }
    />
  );
}

type OpenWith<T> = (value: T) => void;

/** Highest of the member's own org role and the org roles of all their groups, with its source. */
function effectiveOrgRoleLabel(member: GroupMember) {
  const top = member.groupOrgRoles.reduce<Role>(
    (best, grant) =>
      orderedRoles[grant.role] > orderedRoles[best] ? grant.role : best,
    member.directOrgRole,
  );
  if (top === member.directOrgRole) return `${roleLabel(top)} (own role)`;
  const sources = [
    ...new Set(
      member.groupOrgRoles
        .filter((grant) => grant.role === top)
        .map((grant) => grant.groupName),
    ),
  ];
  return `${roleLabel(top)} via ${sources.join(", ")}`;
}

/** What every member of the group gets, e.g. "Grants Member in the organization and roles in 2 projects." */
function grantsSummary(group: Group) {
  const projects = group.projectRoles.length;
  const org = group.orgRole
    ? `${roleLabel(group.orgRole)} in the organization`
    : "no organization role";
  const project =
    projects > 0
      ? ` and roles in ${projects} ${projects === 1 ? "project" : "projects"}`
      : "";
  return `Grants ${org}${project}.`;
}

function GroupMembersDialogController({
  orgId,
  canEdit,
  children,
}: {
  orgId: string;
  canEdit: boolean;
  children: (open: OpenWith<Group>) => React.ReactNode;
}) {
  return (
    <DialogController<string>
      renderDialog={({ state: groupId }) => (
        <GroupMembersDialog orgId={orgId} groupId={groupId} canEdit={canEdit} />
      )}
    >
      {({ openDialog }) => children((group) => openDialog(group.id))}
    </DialogController>
  );
}

function GroupMembersDialog({
  orgId,
  groupId,
  canEdit,
}: {
  orgId: string;
  groupId: string;
  canEdit: boolean;
}) {
  // Read from the list query so the dialog reflects adds and removals.
  const groups = api.groups.list.useQuery({ orgId });
  const group = groups.data?.find((g) => g.id === groupId);
  const utils = api.useUtils();
  const removeMember = api.groups.removeMember.useMutation({
    onSuccess: () => utils.groups.invalidate(),
  });
  const canEditMembers =
    canEdit && group !== undefined && !isScimManaged(group);

  const columns = useMemo<LangfuseColumnDef<GroupMemberRow>[]>(
    () => [
      createTextTableColumn<GroupMemberRow>({
        accessorKey: "name",
        header: "Name",
        nullValue: "-",
      }),
      createTextTableColumn<GroupMemberRow>({
        accessorKey: "email",
        header: "Email",
        nullValue: "-",
      }),
      createTextTableColumn<GroupMemberRow>({
        accessorKey: "directOrgRole",
        header: "Own role",
        mapValue: (value) => (value ? roleLabel(value) : undefined),
        size: 110,
      }),
      createTextTableColumn<GroupMemberRow>({
        accessorKey: "effectiveRole",
        header: "Effective role",
        size: 200,
      }),
    ],
    [],
  );
  const actions = useCallback<
    NonNullable<TableProps<GroupMemberRow>["actions"]>
  >(
    (member) => [
      {
        id: "remove",
        type: "item",
        title: "Remove from group",
        icon: Trash,
        variant: "destructive",
        disabled: editBlockedReason(canEdit, group),
        onClick: () =>
          removeMember.mutate({ orgId, groupId, userId: member.userId }),
      },
    ],
    [canEdit, group, orgId, groupId, removeMember],
  );

  const membersData = useMemo<TableProps<GroupMemberRow>["data"]>(() => {
    if (group)
      return {
        status: "success",
        data: group.members.map((member) => ({
          ...member,
          effectiveRole: effectiveOrgRoleLabel(member),
        })),
      };
    if (groups.error) return { status: "error", error: groups.error.message };
    return { status: "loading" };
  }, [group, groups.error]);

  return (
    <Dialog
      title={group ? `Members of ${group.displayName}` : "Group members"}
      size="md"
      closeLabel="Done"
    >
      <Dialog.Body>
        <div className="flex flex-col gap-3">
          {group && isScimManaged(group) && (
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <Lock size="sm" aria-hidden />
              {SCIM_LOCK_LABEL}
            </p>
          )}
          {group && (
            <p className="text-muted-foreground text-xs">
              {grantsSummary(group)}
            </p>
          )}
          {group && canEditMembers && (
            <AddGroupMembers orgId={orgId} group={group} />
          )}
          <SettingsTable
            tableName="group members"
            columns={columns}
            // Members of SCIM groups are managed in the identity provider.
            actions={group && isScimManaged(group) ? undefined : actions}
            data={membersData}
            getRowLabel={(member) => member.email ?? member.name ?? ""}
            noResultsMessage="This group has no members."
          />
          {removeMember.error && (
            <p className="text-destructive text-sm">
              {removeMember.error.message}
            </p>
          )}
        </div>
      </Dialog.Body>
    </Dialog>
  );
}

function AddGroupMembers({ orgId, group }: { orgId: string; group: Group }) {
  const utils = api.useUtils();
  const [selected, setSelected] = useState<string[]>([]);
  const orgMembers = api.groups.orgMembers.useQuery({ orgId });
  const addMembers = api.groups.addMembers.useMutation({
    onSuccess: () => {
      setSelected([]);
      utils.groups.invalidate();
      showSuccessToast({
        operation: "group_members.update",
        title: "Members added",
        description: `Updated members of ${group.displayName}`,
        duration: 2000,
      });
    },
  });

  const memberIds = new Set(group.members.map((m) => m.userId));
  const options = (orgMembers.data ?? [])
    .filter((user) => !memberIds.has(user.id))
    .map((user) => ({
      value: user.id,
      label: user.name ?? user.email ?? user.id,
      secondaryLabel: user.name ? (user.email ?? undefined) : undefined,
    }));

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <MultiSelectInput
            aria-label="Organization members to add"
            value={selected}
            options={options}
            onValueChange={setSelected}
            placeholder="Select organization members"
            selectedLabel="members selected"
            searchPlaceholder="Search members"
            emptyMessage="No more organization members to add"
            disabled={orgMembers.isLoading}
          />
        </div>
        <Button
          text="Add"
          variant="secondary"
          icon={UserPlus}
          disabled={selected.length === 0}
          loading={addMembers.isPending}
          onClick={() =>
            addMembers.mutate({ orgId, groupId: group.id, userIds: selected })
          }
        />
      </div>
      {addMembers.error && (
        <p className="text-destructive text-sm">{addMembers.error.message}</p>
      )}
    </div>
  );
}

/** Name dialog shared by create and rename. */
function GroupNameDialog({
  title,
  submitLabel,
  initialName,
  isPending,
  error,
  onSubmit,
}: {
  title: string;
  submitLabel: string;
  initialName: string;
  isPending: boolean;
  error?: string;
  onSubmit: (displayName: string) => void;
}) {
  const formId = useId();
  const [name, setName] = useState(initialName);
  const trimmed = name.trim();
  return (
    <Dialog
      title={title}
      size="sm"
      actions={[
        {
          label: submitLabel,
          type: "submit",
          form: formId,
          loading: isPending,
          disabled: trimmed.length === 0,
        },
      ]}
    >
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          if (trimmed) onSubmit(trimmed);
        }}
      >
        <Dialog.Body>
          <div className="flex flex-col gap-2">
            <Input
              aria-label="Group name"
              placeholder="e.g. platform-admins"
              value={name}
              maxLength={256}
              autoFocus
              onChange={(event) => setName(event.target.value)}
            />
            {error && <p className="text-destructive text-sm">{error}</p>}
          </div>
        </Dialog.Body>
      </form>
    </Dialog>
  );
}

function CreateGroupDialogController({
  orgId,
  children,
}: {
  orgId: string;
  children: (open: () => void) => React.ReactNode;
}) {
  const utils = api.useUtils();
  const create = api.groups.create.useMutation({
    onSuccess: () => utils.groups.invalidate(),
  });
  return (
    <DialogController
      onDismiss={() => create.reset()}
      renderDialog={({ closeDialog }) => (
        <GroupNameDialog
          title="Create group"
          submitLabel="Create"
          initialName=""
          isPending={create.isPending}
          error={create.error?.message}
          onSubmit={(displayName) =>
            create.mutate(
              { orgId, displayName },
              {
                onSuccess: (group) => {
                  closeDialog();
                  showSuccessToast({
                    operation: "group.create",
                    title: "Group created",
                    description: `${group.displayName} created. Add members and set its role next.`,
                    duration: 3000,
                  });
                },
              },
            )
          }
        />
      )}
    >
      {({ openDialog }) => children(() => openDialog())}
    </DialogController>
  );
}

function RenameGroupDialogController({
  orgId,
  children,
}: {
  orgId: string;
  children: (open: OpenWith<Group>) => React.ReactNode;
}) {
  const utils = api.useUtils();
  const rename = api.groups.rename.useMutation({
    onSuccess: () => utils.groups.invalidate(),
  });
  return (
    <DialogController<Group>
      onDismiss={() => rename.reset()}
      renderDialog={({ state: group, closeDialog }) => (
        <GroupNameDialog
          key={group.id}
          title="Rename group"
          submitLabel="Save"
          initialName={group.displayName}
          isPending={rename.isPending}
          error={rename.error?.message}
          onSubmit={(displayName) =>
            rename.mutate(
              { orgId, groupId: group.id, displayName },
              { onSuccess: () => closeDialog() },
            )
          }
        />
      )}
    >
      {({ openDialog }) => children(openDialog)}
    </DialogController>
  );
}

function DeleteGroupDialogController({
  orgId,
  children,
}: {
  orgId: string;
  children: (open: OpenWith<Group>) => React.ReactNode;
}) {
  const utils = api.useUtils();
  const remove = api.groups.delete.useMutation({
    onSuccess: () => utils.groups.invalidate(),
  });
  return (
    <ConfirmationDialogController<Group>
      title={(group) => `Delete ${group.displayName}?`}
      text={(group) =>
        `${group.members.length} ${
          group.members.length === 1 ? "member loses" : "members lose"
        } the roles this group grants. Their own roles stay.`
      }
      confirmationText={(group) => group.displayName}
      confirmLabel="Delete group"
      variant="destructive"
      loading={remove.isPending}
      error={remove.error?.message}
      onAfterDismiss={() => remove.reset()}
      onConfirm={async (group) => {
        await remove.mutateAsync({ orgId, groupId: group.id });
      }}
    >
      {({ openDialog }) => children(openDialog)}
    </ConfirmationDialogController>
  );
}
