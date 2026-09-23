import { useCallback, useMemo } from "react";
import { Trash } from "lucide-react";
import { type Role } from "@langfuse/shared";

import { type PaginationBarProps } from "@/src/components/design-system/PaginationBar/PaginationBar";
import { type TableProps } from "@/src/components/design-system/table/Table";
import { SettingsTable } from "@/src/components/SettingsTable/SettingsTable";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { createBadgeTableColumn } from "@/src/components/design-system/table/columns/createBadgeTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { createUserTableColumn } from "@/src/components/design-system/table/columns/createUserTableColumn";
import { type LangfuseColumnDef } from "@/src/components/table/types";

export type MembershipInvitesSettingsTableRow = {
  email: string;
  createdAt: Date;
  orgRole: Role;
  projectRole?: Role;
  invitedByUser: { name: string | null; image: string | null } | null;
  inviteId: string;
};

export function MembershipInvitesSettingsTable({
  showProjectRole,
  hasCudAccess,
  onDelete,
  pagination,
  ...tableProps
}: Pick<
  TableProps<MembershipInvitesSettingsTableRow>,
  "data" | "loadingRowCount"
> & {
  showProjectRole: boolean;
  hasCudAccess: boolean;
  onDelete: (invite: MembershipInvitesSettingsTableRow) => void;
  pagination: PaginationBarProps;
}) {
  const columns = useMemo<
    LangfuseColumnDef<MembershipInvitesSettingsTableRow>[]
  >(
    () => [
      createTextTableColumn<MembershipInvitesSettingsTableRow>({
        accessorKey: "email",
        header: "Email",
      }),
      createBadgeTableColumn<MembershipInvitesSettingsTableRow>({
        accessorKey: "orgRole",
        header: "Organization Role",
      }),
      ...(showProjectRole
        ? [
            createTextTableColumn<MembershipInvitesSettingsTableRow>({
              accessorKey: "projectRole",
              header: "Project Role",
              nullValue: "-",
            }),
          ]
        : []),
      createUserTableColumn<MembershipInvitesSettingsTableRow>({
        accessorKey: "invitedByUser",
        header: "Invited By",
        variant: "avatar",
        nullValue: "-",
      }),
      createDateTableColumn<MembershipInvitesSettingsTableRow>({
        accessorKey: "createdAt",
        header: "Invited On",
        mode: "relative",
      }),
    ],
    [showProjectRole],
  );
  const actions = useCallback<
    NonNullable<TableProps<MembershipInvitesSettingsTableRow>["actions"]>
  >(
    (invite) => [
      {
        id: "delete",
        type: "item",
        title: "Cancel invitation",
        icon: Trash,
        variant: "destructive",
        disabled: hasCudAccess
          ? undefined
          : { reason: "You do not have permission to cancel this invitation" },
        onClick: () => onDelete(invite),
      },
    ],
    [hasCudAccess, onDelete],
  );

  return (
    <SettingsTable
      tableName="membership invites"
      columns={columns}
      actions={actions}
      pagination={pagination}
      {...tableProps}
    />
  );
}
