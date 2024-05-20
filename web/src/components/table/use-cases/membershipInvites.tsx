import { DataTable } from "@/src/components/table/data-table";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/src/components/ui/avatar";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { api } from "@/src/utils/api";
import type { RouterOutput } from "@/src/utils/types";
import { type ProjectRole, type OrganizationRole } from "@langfuse/shared";
import { Trash } from "lucide-react";
import { useQueryParams, withDefault, NumberParam } from "use-query-params";

export type InvitesTableRow = {
  email: string;
  createdAt: Date;
  orgRole: OrganizationRole;
  defaultProjectRole?: ProjectRole;
  projectRole?: ProjectRole;
  sender: {
    name: string | null;
    image: string | null;
  } | null;
  meta: {
    inviteId: string;
  };
};

export default function InvitesTable({
  orgId,
  projectId,
}: {
  orgId: string;
  projectId?: string;
}) {
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 10),
  });

  const invites = api.members.allInvites.useQuery({
    orgId,
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
  });
  const totalCount = invites.data?.totalCount ?? 0;

  const utils = api.useUtils();

  const mutDeleteInvite = api.members.deleteInvite.useMutation({
    onSuccess: () => utils.members.invalidate(),
  });

  const hasCudAccess = useHasOrganizationAccess({
    organizationId: orgId,
    scope: "members:CUD",
  });

  const columns: LangfuseColumnDef<InvitesTableRow>[] = [
    {
      accessorKey: "email",
      id: "email",
      header: "Email",
    },
    {
      accessorKey: "orgRole",
      id: "orgRole",
      header: "Organization Role",
    },
    {
      accessorKey: "defaultProjectRole",
      id: "defaultProjectRole",
      header: "Default Project Role",
      headerTooltip: {
        description:
          "The default role for this user in all projects within this organization. Organization owners are automatically project owners.",
      },
    },
    {
      accessorKey: "createdAt",
      id: "createdAt",
      header: "Invited On",
      cell: ({ row }) => {
        const value = row.getValue("createdAt") as InvitesTableRow["createdAt"];
        return value ? new Date(value).toLocaleString() : undefined;
      },
    },
    ...(projectId
      ? [
          {
            accessorKey: "projectRole",
            id: "projectRole",
            header: "Project Role",
          },
        ]
      : []),
    {
      accessorKey: "sender",
      id: "sender",
      header: "Invited By",
      cell: ({ row }) => {
        const sender = row.getValue("sender") as InvitesTableRow["sender"];
        const { name, image } = sender || {};
        return (
          <div className="flex items-center space-x-2">
            <Avatar className="h-7 w-7">
              <AvatarImage
                src={image ?? undefined}
                alt={name ?? "User Avatar"}
              />
              <AvatarFallback>
                {name
                  ? name
                      .split(" ")
                      .map((word) => word[0])
                      .slice(0, 2)
                      .concat("")
                  : null}
              </AvatarFallback>
            </Avatar>
            <span>{name ?? "-"}</span>
          </div>
        );
      },
    },
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

  // const [columnVisibility, setColumnVisibility] =
  //   useColumnVisibility<InvitesTableRow>("invitesColumnVisibility", columns);

  const convertToTableRow = (
    invite: RouterOutput["members"]["allInvites"]["invitations"][0],
  ): InvitesTableRow => {
    return {
      meta: {
        inviteId: invite.id,
      },
      email: invite.email,
      createdAt: invite.createdAt,
      orgRole: invite.orgRole,
      defaultProjectRole: invite.defaultProjectRole ?? undefined,
      projectRole:
        invite.projectId === projectId
          ? invite.projectRole ?? undefined
          : undefined,
      sender: invite.sender,
    };
  };

  return (
    <>
      <DataTableToolbar
        columns={columns}
        // columnVisibility={columnVisibility}
        // setColumnVisibility={setColumnVisibility}
      />
      <DataTable
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
                  data: invites.data.invitations.map((i) =>
                    convertToTableRow(i),
                  ),
                }
        }
        pagination={{
          pageCount: Math.ceil(totalCount / paginationState.pageSize),
          onChange: setPaginationState,
          state: paginationState,
        }}
        // columnVisibility={columnVisibility}
        // onColumnVisibilityChange={setColumnVisibility}
      />
    </>
  );
}
