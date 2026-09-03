/* eslint-disable @repo/no-null-render */
import { DataTable } from "@/src/components/table/data-table";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { api } from "@/src/utils/api";
import { safeExtract } from "@/src/utils/map-utils";
import type { RouterOutput } from "@/src/utils/types";
import { Trash } from "lucide-react";
import { type Role } from "@langfuse/shared";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import Header from "@/src/components/layouts/header";
import useSessionStorage from "@/src/components/useSessionStorage";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { createUserTableColumn } from "@/src/components/design-system/table/columns/createUserTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";

export type InvitesTableRow = {
  email: string;
  createdAt: Date;
  orgRole: Role;
  projectRole?: Role;
  invitedByUser: {
    name: string | null;
    image: string | null;
  } | null;
  meta: {
    inviteId: string;
  };
};

export function MembershipInvitesPage({
  orgId,
  projectId,
}: {
  orgId: string;
  projectId?: string;
}) {
  const paginationKey = projectId
    ? `projectInvites_${projectId}_pagination`
    : `orgInvites_${orgId}_pagination`;

  const hasOrgViewAccess = useHasOrganizationAccess({
    organizationId: orgId,
    scope: "organizationMembers:read",
  });
  const hasProjectViewAccess =
    useHasProjectAccess({
      projectId,
      scope: "projectMembers:read",
    }) || hasOrgViewAccess;

  const [paginationState, setPaginationState] = useSessionStorage(
    paginationKey,
    {
      pageIndex: 0,
      pageSize: 10,
    },
  );

  const invites = projectId
    ? api.members.allInvitesFromProject.useQuery(
        {
          projectId,
          page: paginationState.pageIndex,
          limit: paginationState.pageSize,
        },
        {
          enabled: hasProjectViewAccess,
        },
      )
    : api.members.allInvitesFromOrg.useQuery(
        {
          orgId,
          page: paginationState.pageIndex,
          limit: paginationState.pageSize,
        },
        {
          enabled: hasOrgViewAccess,
        },
      );

  const totalCount = invites.data?.totalCount ?? null;

  const utils = api.useUtils();

  const mutDeleteInvite = api.members.deleteInvite.useMutation({
    onSuccess: () => utils.members.invalidate(),
  });

  const hasCudAccess = useHasOrganizationAccess({
    organizationId: orgId,
    scope: "organizationMembers:CUD",
  });

  const columns: LangfuseColumnDef<InvitesTableRow>[] = [
    createTextTableColumn<InvitesTableRow>({
      accessorKey: "email",
      header: "Email",
    }),
    createTextTableColumn<InvitesTableRow>({
      accessorKey: "orgRole",
      header: "Organization Role",
    }),
    createDateTableColumn<InvitesTableRow>({
      accessorKey: "createdAt",
      header: "Invited On",
    }),
    ...(projectId
      ? [
          createTextTableColumn<InvitesTableRow>({
            accessorKey: "projectRole",
            header: "Project Role",
          }),
        ]
      : []),
    createUserTableColumn<InvitesTableRow>({
      accessorKey: "invitedByUser",
      header: "Invited By",
      variant: "avatar",
      emptyValue: "-",
    }),
    {
      accessorKey: "meta",
      id: "meta",
      header: "Actions",
      cell: ({ row }) => {
        const { inviteId } = row.getValue("meta") as InvitesTableRow["meta"];
        return hasCudAccess ? (
          <div className="flex space-x-2">
            <button
              onClick={() => {
                if (
                  confirm("Are you sure you want to cancel this invitation?")
                ) {
                  mutDeleteInvite.mutate({ inviteId, orgId });
                }
              }}
            >
              <Trash size={14} />
            </button>
          </div>
        ) : null;
      },
    },
  ];

  const convertToTableRow = (
    invite: RouterOutput["members"]["allInvitesFromOrg"]["invitations"][0],
  ): InvitesTableRow => {
    return {
      meta: {
        inviteId: invite.id,
      },
      email: invite.email,
      createdAt: invite.createdAt,
      orgRole: invite.orgRole,
      projectRole:
        invite.projectId === projectId
          ? (invite.projectRole ?? undefined)
          : undefined,
      invitedByUser: invite.invitedByUser,
    };
  };

  if (projectId ? !hasProjectViewAccess : !hasOrgViewAccess) {
    return null;
  }

  if (totalCount === 0) return null;

  return (
    <>
      {/* Header included in order to hide it when there are not invites yet */}
      <Header title="Membership Invites" />
      <DataTableToolbar columns={columns} />
      <DataTable
        tableName="membershipInvites"
        columns={columns}
        data={
          invites.isLoading
            ? { isLoading: true, isError: false }
            : invites.isError
              ? {
                  isLoading: false,
                  isError: true,
                  error: invites.error.message,
                }
              : {
                  isLoading: false,
                  isError: false,
                  data: safeExtract(invites.data, "invitations", []).map((i) =>
                    convertToTableRow(i),
                  ),
                }
        }
        pagination={{
          totalCount,
          onChange: setPaginationState,
          state: paginationState,
        }}
      />
    </>
  );
}
