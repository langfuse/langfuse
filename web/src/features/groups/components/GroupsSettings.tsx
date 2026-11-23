import { useCallback, useId, useMemo, useState } from "react";
import { StringParam, useQueryParam } from "use-query-params";
import {
  Lock,
  PencilLine,
  PlusIcon,
  Trash,
  UserPlus,
  Users,
} from "@langfuse/icons";
import { type Role } from "@langfuse/shared";
import { Banner } from "@/src/components/design-system/Banner/Banner";
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
import { TableCard } from "@/src/components/TableCard/TableCard";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import {
  describeGroupRoleCell,
  GroupRoleDialogController,
} from "@/src/features/groups/components/GroupRoleDialogController";
import { groupTableColumns } from "@/src/features/groups/components/groupTableColumns";
import { RoleCellTrigger } from "@/src/features/rbac/components/RoleCellTrigger";
import {
  GROUP_SOURCE_DISPLAY,
  isScimManaged,
  SCIM_LOCK_LABEL,
} from "@/src/features/groups/groupSource";
import { roleName } from "@/src/features/rbac/components/roleDisplay";
import { resolveEffectiveRoles } from "@langfuse/shared/rbac";
import { byPermissionCount } from "@/src/features/rbac/utils/byPermissionCount";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { default as useIsFeatureEnabled } from "@/src/features/feature-flags/hooks/useIsFeatureEnabled";
import { useAddGroupMembers } from "@/src/features/groups/hooks/useAddGroupMembers";
import { useCreateGroup } from "@/src/features/groups/hooks/useCreateGroup";
import { useDeleteGroup } from "@/src/features/groups/hooks/useDeleteGroup";
import { useGroupOrgMembers } from "@/src/features/groups/hooks/useGroupOrgMembers";
import { useOrgGroups } from "@/src/features/groups/hooks/useOrgGroups";
import { useRemoveGroupMember } from "@/src/features/groups/hooks/useRemoveGroupMember";
import { useRenameGroup } from "@/src/features/groups/hooks/useRenameGroup";
import { useSetGroupOrgRole } from "@/src/features/groups/hooks/useSetGroupOrgRole";
import { type RouterOutputs } from "@/src/utils/api";

type Group = RouterOutputs["groups"]["list"][number];
type GroupMember = Group["members"][number];
type GroupMemberRow = GroupMember & { effectiveRole: string };

const NO_EDIT_REASON = "You do not have permission to manage groups";

const blockedReason = (
  canEdit: boolean,
  group: { source: string } | undefined,
  scimAction: "Change" | "Delete",
) => {
  if (!canEdit) return { reason: NO_EDIT_REASON };
  if (group && isScimManaged(group))
    return {
      reason: `Synced from your identity provider. ${scimAction} it there.`,
    };
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

export function GroupsSettings({ orgId }: { orgId: string }) {
  const hasEntitlement = useHasEntitlement("admin-api");
  const hasAccess = useHasOrganizationAccess({
    organizationId: orgId,
    scope: "groups:read",
  });
  const canEdit = useHasOrganizationAccess({
    organizationId: orgId,
    scope: "groups:CUD",
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
        <Banner title="Not available">
          SCIM provisioning is not available on your plan.
        </Banner>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div>
        {header}
        <Banner title="Access denied">
          You do not have permission to view the groups of this organization.
        </Banner>
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
  const shared = groupTableColumns<GroupRow>();
  return [
    shared.name,
    shared.source,
    createTextTableColumn<GroupRow>({
      accessorKey: "externalId",
      header: "IdP ID",
      nullValue: "-",
      enableHiding: true,
      defaultHidden: true,
    }),
    shared.members,
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
  const groups = useOrgGroups(orgId);
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
        disabled: blockedReason(canEdit, group, "Change"),
        onClick: () => onRename(group),
      },
      {
        id: "delete",
        type: "item",
        title: "Delete group",
        icon: Trash,
        variant: "destructive",
        disabled: blockedReason(canEdit, group, "Delete"),
        onClick: () => onDelete(group),
      },
    ],
    [canEdit, onMembers, onRename, onDelete],
  );

  return (
    <TableCard
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

const orgRoleBlockedReason = (canEdit: boolean, isSaving: boolean) => {
  if (!canEdit) return NO_EDIT_REASON;
  if (isSaving) return "Saving…";
  return undefined;
};

function GroupOrgRoleSelect({
  orgId,
  group,
  canEdit,
}: {
  orgId: string;
  group: Group;
  canEdit: boolean;
}) {
  const isAiGatewayEnabled = useIsFeatureEnabled("aiGateway", {
    organizationId: orgId,
  });
  const setOrgRole = useSetGroupOrgRole(group.displayName);
  return (
    <GroupRoleDialogController
      level="organization"
      groupName={group.displayName}
      memberCount={group.members.length}
      orgRole={group.orgRole}
      isAiGatewayEnabled={isAiGatewayEnabled}
      disabledReason={orgRoleBlockedReason(canEdit, setOrgRole.isPending)}
      onChange={(role) => setOrgRole.mutate({ orgId, groupId: group.id, role })}
    >
      {(openDialog) => (
        <RoleCellTrigger
          {...describeGroupRoleCell({
            level: "organization",
            groupName: group.displayName,
            orgRole: group.orgRole,
          })}
          onClick={openDialog}
        />
      )}
    </GroupRoleDialogController>
  );
}

type OpenWith<T> = (value: T) => void;

function effectiveOrgRoleLabel(member: GroupMember) {
  const [top = member.directOrgRole] = resolveEffectiveRoles(
    [member.directOrgRole, ...member.groupOrgRoles.map((grant) => grant.role)],
    "organization",
  ).toSorted(byPermissionCount);
  if (top === member.directOrgRole) return `${roleName(top)} (own role)`;
  const sources = [
    ...new Set(
      member.groupOrgRoles
        .filter((grant) => grant.role === top)
        .map((grant) => grant.groupName),
    ),
  ];
  return `${roleName(top)} via ${sources.join(", ")}`;
}

function grantsSummary(group: Group) {
  const projects = group.projectRoles.length;
  const org = group.orgRole
    ? `${roleName(group.orgRole)} in the organization`
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
  // `?group=<id>` opens that group's members, so other pages can link to them.
  const [linkedGroupId, setLinkedGroupId] = useQueryParam("group", StringParam);
  return (
    <DialogController<string>
      initialState={() => linkedGroupId ?? undefined}
      onDismiss={() => {
        if (linkedGroupId) setLinkedGroupId(undefined);
      }}
      renderDialog={({ state: groupId }) => (
        <GroupMembersDialog orgId={orgId} groupId={groupId} canEdit={canEdit} />
      )}
    >
      {({ openDialog }) => children((group) => openDialog(group.id))}
    </DialogController>
  );
}

const memberColumns: LangfuseColumnDef<GroupMemberRow>[] = [
  createTextTableColumn<GroupMemberRow>({
    accessorKey: "name",
    header: "Name",
    nullValue: "-",
    sensitive: true,
  }),
  createTextTableColumn<GroupMemberRow>({
    accessorKey: "email",
    header: "Email",
    nullValue: "-",
    sensitive: true,
  }),
  createTextTableColumn<GroupMemberRow>({
    accessorKey: "directOrgRole",
    header: "Own role",
    mapValue: (value) => (value ? roleName(value as Role) : undefined),
    size: 110,
  }),
  createTextTableColumn<GroupMemberRow>({
    accessorKey: "effectiveRole",
    header: "Effective role",
    size: 200,
  }),
];

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
  const groups = useOrgGroups(orgId);
  const group = groups.data?.find((g) => g.id === groupId);
  const removeMember = useRemoveGroupMember();

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
        disabled: blockedReason(canEdit, group, "Change"),
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
    if (groups.data) return { status: "error", error: "Group not found" };
    return { status: "loading" };
  }, [group, groups.error, groups.data]);

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
          {group && canEdit && !isScimManaged(group) && (
            <AddGroupMembers orgId={orgId} group={group} />
          )}
          <TableCard
            tableName="group members"
            columns={memberColumns}
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
  const [selected, setSelected] = useState<string[]>([]);
  const orgMembers = useGroupOrgMembers(orgId);
  const addMembers = useAddGroupMembers(group.displayName);

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
            addMembers.mutate(
              { orgId, groupId: group.id, userIds: selected },
              { onSuccess: () => setSelected([]) },
            )
          }
        />
      </div>
      {addMembers.error && (
        <p className="text-destructive text-sm">{addMembers.error.message}</p>
      )}
    </div>
  );
}

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
  const create = useCreateGroup();
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
              { onSuccess: () => closeDialog() },
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
  const rename = useRenameGroup();
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
  const remove = useDeleteGroup();
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
