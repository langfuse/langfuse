import { DataTable } from "@/src/components/table/data-table";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/src/components/ui/avatar";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { CreateProjectMemberButton } from "@/src/features/rbac/components/CreateProjectMemberButton";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { api } from "@/src/utils/api";
import type { RouterOutput } from "@/src/utils/types";
import { type ProjectRole, type OrganizationRole } from "@langfuse/shared";
import { Trash } from "lucide-react";
import { useSession } from "next-auth/react";
import { useQueryParams, withDefault, NumberParam } from "use-query-params";

export type MembersTableRow = {
  user: {
    image: string | null;
    name: string | null;
  };
  email: string | null;
  createdAt: Date;
  orgRole: OrganizationRole;
  defaultProjectRole?: ProjectRole;
  projectRole?: ProjectRole;
  meta: {
    userId: string;
    orgMembershipId: string;
  };
};

export default function MembersTable({
  orgId,
  projectId,
}: {
  orgId: string;
  projectId?: string;
}) {
  const session = useSession();
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 10),
  });

  const members = api.members.all.useQuery({
    orgId,
    projectId,
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
  });
  const totalCount = members.data?.totalCount ?? 0;

  const utils = api.useUtils();

  const mutDeleteMember = api.members.deleteMembership.useMutation({
    onSuccess: () => utils.members.invalidate(),
  });

  const hasCudAccess = useHasOrganizationAccess({
    organizationId: orgId,
    scope: "members:CUD",
  });

  const columns: LangfuseColumnDef<MembersTableRow>[] = [
    {
      accessorKey: "user",
      id: "user",
      header: "Name",
      cell: ({ row }) => {
        const { name, image } = row.getValue("user") as MembersTableRow["user"];
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
            <span>{name}</span>
          </div>
        );
      },
    },
    {
      accessorKey: "email",
      id: "email",
      header: "Email",
    },
    {
      accessorKey: "orgRole",
      id: "orgRole",
      header: "Organization Role",
      enableHiding: true,
    },
    {
      accessorKey: "createdAt",
      id: "createdAt",
      header: "Member Since",
      enableHiding: true,
      defaultHidden: true,
      cell: ({ row }) => {
        const value = row.getValue("createdAt") as MembersTableRow["createdAt"];
        return value ? new Date(value).toLocaleString() : undefined;
      },
    },
    {
      accessorKey: "defaultProjectRole",
      id: "defaultProjectRole",
      header: "Default Project Role",
      enableHiding: true,
      headerTooltip: {
        description:
          "The default role for this user in all projects within this organization. Organization owners are automatically project owners.",
      },
    },
    ...(projectId
      ? [
          {
            accessorKey: "projectRole",
            id: "projectRole",
            header: "Project Role",
            enableHiding: true,
          },
        ]
      : []),
    {
      accessorKey: "meta",
      id: "meta",
      header: "Actions",
      enableHiding: false,
      cell: ({ row }) => {
        const { orgMembershipId, userId } = row.getValue(
          "meta",
        ) as MembersTableRow["meta"];
        return hasCudAccess || (userId && userId === session.data?.user?.id) ? (
          <div className="flex space-x-2">
            <button
              onClick={() => {
                if (
                  confirm(
                    userId === session.data?.user?.id
                      ? "Are you sure you want to leave the organization?"
                      : "Are you sure you want to remove this member from the organization?",
                  )
                ) {
                  mutDeleteMember.mutate({ orgId, orgMembershipId });
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

  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<MembersTableRow>("membersColumnVisibility", columns);

  const convertToTableRow = (
    orgMembership: RouterOutput["members"]["all"]["memberships"][0],
  ): MembersTableRow => {
    return {
      meta: {
        userId: orgMembership.userId,
        orgMembershipId: orgMembership.id,
      },
      email: orgMembership.user.email,
      user: {
        image: orgMembership.user.image,
        name: orgMembership.user.name,
      },
      createdAt: orgMembership.createdAt,
      orgRole: orgMembership.role,
      defaultProjectRole: orgMembership.defaultProjectRole ?? undefined,
      projectRole: orgMembership.projectRole,
    };
  };

  return (
    <>
      <DataTableToolbar
        columns={columns}
        columnVisibility={columnVisibility}
        setColumnVisibility={setColumnVisibility}
        actionButtons={
          <CreateProjectMemberButton orgId={orgId} projectId={projectId} />
        }
      />
      <DataTable
        columns={columns}
        data={
          members.isLoading
            ? { isLoading: true, isError: false }
            : members.isError
              ? {
                  isLoading: false,
                  isError: true,
                  error: members.error.message,
                }
              : {
                  isLoading: false,
                  isError: false,
                  data: members.data.memberships.map((t) =>
                    convertToTableRow(t),
                  ),
                }
        }
        pagination={{
          pageCount: Math.ceil(totalCount / paginationState.pageSize),
          onChange: setPaginationState,
          state: paginationState,
        }}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibility}
      />
    </>
  );
}
