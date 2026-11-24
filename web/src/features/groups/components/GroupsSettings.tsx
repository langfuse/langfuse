import { useCallback, useId, useMemo, useState } from "react";
import { PencilLine, PlusIcon, Trash, Users } from "@langfuse/icons";
import { Banner } from "@/src/components/design-system/Banner/Banner";
import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { Input } from "@/src/components/design-system/Input/Input";
import { type TableProps } from "@/src/components/design-system/table/Table";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import Header from "@/src/components/layouts/header";
import { TableCard } from "@/src/components/TableCard/TableCard";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { CreateGroupDialog } from "@/src/features/groups/components/CreateGroupDialog";
import {
  describeGroupRoleCell,
  groupRoleOptions,
} from "@/src/features/groups/components/GroupRoleDialog";
import { GroupDialogHost } from "@/src/features/groups/components/GroupDialogHost";
import { groupTableColumns } from "@/src/features/groups/components/groupTableColumns";
import { useGroupDialogParam } from "@/src/features/groups/groupDialogLink";
import { RoleCellTrigger } from "@/src/features/rbac/components/RoleCellTrigger";
import {
  GROUP_SOURCE_DISPLAY,
  isScimManaged,
  NO_GROUP_EDIT_REASON,
} from "@/src/features/groups/groupSource";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { default as useIsFeatureEnabled } from "@/src/features/feature-flags/hooks/useIsFeatureEnabled";
import { useCreateGroup } from "@/src/features/groups/hooks/useCreateGroup";
import { useDeleteGroup } from "@/src/features/groups/hooks/useDeleteGroup";
import { useGroupOrgMembers } from "@/src/features/groups/hooks/useGroupOrgMembers";
import { useOrgGroups } from "@/src/features/groups/hooks/useOrgGroups";
import { useRenameGroup } from "@/src/features/groups/hooks/useRenameGroup";
import { type RouterOutputs } from "@/src/utils/api";

type Group = RouterOutputs["groups"]["list"][number];

const blockedReason = (
  canEdit: boolean,
  group: { source: string } | undefined,
  scimAction: "Change" | "Delete",
) => {
  if (!canEdit) return { reason: NO_GROUP_EDIT_REASON };
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
  onOpenGroup: (group: Group) => void,
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
        <RoleCellTrigger
          {...describeGroupRoleCell({
            level: "organization",
            groupName: row.original.group.displayName,
            orgRole: row.original.group.orgRole,
          })}
          onClick={() => onOpenGroup(row.original.group)}
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
  const [, setOpenGroupId] = useGroupDialogParam();
  const openGroup = (group: Pick<Group, "id">) => setOpenGroupId(group.id);

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

  return (
    <>
      <GroupDialogHost orgId={orgId} />
      <CreateGroupDialogController orgId={orgId} onPartlySaved={openGroup}>
        {(openCreate) => (
          <RenameGroupDialogController orgId={orgId}>
            {(openRename) => (
              <DeleteGroupDialogController orgId={orgId}>
                {(openDelete) => (
                  <GroupsSettingsTable
                    data={data}
                    canEdit={canEdit}
                    search={search}
                    onSearchChange={setSearch}
                    onCreate={openCreate}
                    onOpenGroup={openGroup}
                    onRename={openRename}
                    onDelete={openDelete}
                  />
                )}
              </DeleteGroupDialogController>
            )}
          </RenameGroupDialogController>
        )}
      </CreateGroupDialogController>
    </>
  );
}

function GroupsSettingsTable({
  data,
  canEdit,
  search,
  onSearchChange,
  onCreate,
  onOpenGroup,
  onRename,
  onDelete,
}: {
  data: TableProps<GroupRow>["data"];
  canEdit: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  onCreate: () => void;
  onOpenGroup: (group: Group) => void;
  onRename: (group: Group) => void;
  onDelete: (group: Group) => void;
}) {
  const columns = useMemo(() => groupColumns(onOpenGroup), [onOpenGroup]);
  const actions = useCallback<NonNullable<TableProps<GroupRow>["actions"]>>(
    ({ group }) => [
      {
        id: "members",
        type: "item",
        title:
          canEdit && !isScimManaged(group) ? "Manage members" : "View members",
        icon: Users,
        onClick: () => onOpenGroup(group),
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
    [canEdit, onOpenGroup, onRename, onDelete],
  );

  return (
    <TableCard
      tableName="organization groups"
      columns={columns}
      data={data}
      actions={actions}
      onRowClick={(row) => onOpenGroup(row.group)}
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

type OpenWith<T> = (value: T) => void;

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
  onPartlySaved,
  children,
}: {
  orgId: string;
  /** The group exists but its role or members failed to save. */
  onPartlySaved: OpenWith<Pick<Group, "id">>;
  children: (open: () => void) => React.ReactNode;
}) {
  return (
    <DialogController
      renderDialog={({ closeDialog }) => (
        <ConnectedCreateGroupDialog
          orgId={orgId}
          onPartlySaved={onPartlySaved}
          onDone={closeDialog}
        />
      )}
    >
      {({ openDialog }) => children(() => openDialog())}
    </DialogController>
  );
}

/** Creates the group, then gives it the picked role and members. */
function ConnectedCreateGroupDialog({
  orgId,
  onPartlySaved,
  onDone,
}: {
  orgId: string;
  onPartlySaved: OpenWith<Pick<Group, "id">>;
  onDone: () => void;
}) {
  const isAiGatewayEnabled = useIsFeatureEnabled("aiGateway", {
    organizationId: orgId,
  });
  const orgMembers = useGroupOrgMembers(orgId);
  // On a partial save the new group opens, where the role and members can be finished.
  const create = useCreateGroup({ orgId, onDone, onPartlySaved });

  return (
    <CreateGroupDialog
      roles={groupRoleOptions("organization", isAiGatewayEnabled)}
      people={(orgMembers.data ?? []).map((user) => ({
        value: user.id,
        label: user.name ?? user.email ?? user.id,
        secondaryLabel: user.name ? (user.email ?? undefined) : undefined,
      }))}
      isLoadingPeople={orgMembers.isLoading}
      isPending={create.isSaving}
      error={create.error}
      onSubmit={(group) => {
        create.submit(group).catch(() => undefined);
      }}
    />
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
