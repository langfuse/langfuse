import { useMemo } from "react";

import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { type PaginationBarState } from "@/src/components/design-system/PaginationBar/PaginationBar";
import { type AsyncTableData } from "@/src/components/design-system/table/Table";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { api } from "@/src/utils/api";
import { safeExtract } from "@/src/utils/map-utils";
import type { RouterOutput } from "@/src/utils/types";
import {
  MembershipInvitesSettingsTable,
  type MembershipInvitesSettingsTableRow,
} from "./MembershipInvitesSettingsTable";

export function ConnectedMembershipInvitesSettingsTable({
  orgId,
  projectId,
  query,
  paginationState,
  setPaginationState,
}: {
  orgId: string;
  projectId?: string;
  query: {
    data:
      | RouterOutput["members"]["allInvitesFromProject"]
      | RouterOutput["members"]["allInvitesFromOrg"]
      | undefined;
    error: { message: string } | null;
    isError: boolean;
    isPending: boolean;
  };
  paginationState: PaginationBarState;
  setPaginationState: (state: PaginationBarState) => void;
}) {
  const hasCudAccess = useHasOrganizationAccess({
    organizationId: orgId,
    scope: "organizationMembers:CUD",
  });

  const utils = api.useUtils();

  const deleteInvite = api.members.deleteInvite.useMutation({
    onSuccess: () => utils.members.invalidate(),
  });

  const tableData = useMemo<
    AsyncTableData<MembershipInvitesSettingsTableRow[]>
  >(() => {
    if (query.isPending) return { status: "loading" };
    if (query.isError) {
      return {
        status: "error",
        error: query.error?.message ?? "Failed to load membership invites",
      };
    }
    return {
      status: "success",
      data: safeExtract(query.data, "invitations", []).map((invite) => ({
        inviteId: invite.id,
        email: invite.email,
        createdAt: invite.createdAt,
        orgRole: invite.orgRole,
        projectRole:
          invite.projectId === projectId
            ? (invite.projectRole ?? undefined)
            : undefined,
        invitedByUser: invite.invitedByUser,
      })),
    };
  }, [query.data, query.error, query.isError, query.isPending, projectId]);

  return (
    <ConfirmationDialogController<MembershipInvitesSettingsTableRow>
      title="Cancel invitation"
      text={(invite) =>
        `Are you sure you want to cancel the invitation for ${invite.email}?`
      }
      confirmLabel="Cancel invitation"
      variant="destructive"
      loading={deleteInvite.isPending}
      error={deleteInvite.error?.message}
      onAfterDismiss={deleteInvite.reset}
      onConfirm={async (invite) => {
        await deleteInvite.mutateAsync({
          inviteId: invite.inviteId,
          orgId,
        });
      }}
    >
      {({ openDialog }) => (
        <MembershipInvitesSettingsTable
          showProjectRole={Boolean(projectId)}
          hasCudAccess={hasCudAccess}
          onDelete={openDialog}
          data={tableData}
          loadingRowCount={paginationState.pageSize}
          pagination={{
            totalCount: query.data?.totalCount ?? null,
            onChange: setPaginationState,
            state: paginationState,
          }}
        />
      )}
    </ConfirmationDialogController>
  );
}
