import { DataTable } from "@/src/components/table/data-table";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/src/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { CreateProjectMemberButton } from "@/src/features/rbac/components/CreateProjectMemberButton";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { api } from "@/src/utils/api";
import type { RouterOutput } from "@/src/utils/types";
import { Role } from "@langfuse/shared";
import { type Row } from "@tanstack/react-table";
import { Trash } from "lucide-react";
import { useSession } from "next-auth/react";
import { useQueryParams, withDefault, NumberParam } from "use-query-params";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { useHasOrgEntitlement } from "@/src/features/entitlements/hooks";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";

export type MembersTableRow = {
  user: {
    image: string | null;
    name: string | null;
  };
  email: string | null;
  createdAt: Date;
  orgRole: Role;
  projectRole?: Role;
  meta: {
    userId: string;
    orgMembershipId: string;
  };
};

export default function MembersTable({
  orgId,
  project,
}: {
  orgId: string;
  project?: { id: string; name: string };
}) {
  const session = useSession();
  const hasViewAccess = useHasOrganizationAccess({
    organizationId: orgId,
    scope: "organizationMembers:read",
  });
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 10),
  });

  const members = api.members.all.useQuery(
    {
      orgId,
      projectId: project?.id,
      page: paginationState.pageIndex,
      limit: paginationState.pageSize,
    },
    {
      enabled: hasViewAccess,
    },
  );
  const totalCount = members.data?.totalCount ?? 0;

  const utils = api.useUtils();

  const mutDeleteMember = api.members.deleteMembership.useMutation({
    onSuccess: () => utils.members.invalidate(),
  });

  const hasCudAccess = useHasOrganizationAccess({
    organizationId: orgId,
    scope: "organizationMembers:CUD",
  });

  const projectRolesEntitlement = useHasOrgEntitlement("rbac-project-roles");

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
      cell: ({ row }) => {
        const orgRole = row.getValue("orgRole") as MembersTableRow["orgRole"];
        const { orgMembershipId } = row.getValue(
          "meta",
        ) as MembersTableRow["meta"];
        return (
          <OrgRoleDropdown
            orgMembershipId={orgMembershipId}
            currentRole={orgRole}
            orgId={orgId}
            hasCudAccess={hasCudAccess}
          />
        );
      },
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
    ...(project
      ? [
          {
            accessorKey: "projectRole",
            id: "projectRole",
            header: "Project Role",
            enableHiding: true,
            headerTooltip: {
              description:
                "The role for this user in this specific project. This role overrides the default project role.",
            },
            cell: ({
              row,
            }: {
              row: Row<MembersTableRow>; // need to specify the type here due to conditional rendering
            }) => {
              const projectRole = row.getValue(
                "projectRole",
              ) as MembersTableRow["projectRole"];
              const { orgMembershipId, userId } = row.getValue(
                "meta",
              ) as MembersTableRow["meta"];

              if (!projectRolesEntitlement) return "N/A";

              return (
                <ProjectRoleDropdown
                  orgMembershipId={orgMembershipId}
                  userId={userId}
                  currentProjectRole={projectRole ?? null}
                  orgId={orgId}
                  projectId={project.id}
                  hasCudAccess={hasCudAccess}
                />
              );
            },
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
      projectRole: orgMembership.projectRole,
    };
  };

  if (!hasViewAccess) {
    return (
      <Alert>
        <AlertTitle>Access Denied</AlertTitle>
        <AlertDescription>
          You do not have permission to view members of this organization.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      <DataTableToolbar
        columns={columns}
        columnVisibility={columnVisibility}
        setColumnVisibility={setColumnVisibility}
        actionButtons={
          <CreateProjectMemberButton orgId={orgId} project={project} />
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

const OrgRoleDropdown = ({
  orgMembershipId,
  currentRole,
  orgId,
  hasCudAccess,
}: {
  orgMembershipId: string;
  currentRole: Role;
  orgId: string;
  hasCudAccess: boolean;
}) => {
  const utils = api.useUtils();
  const mut = api.members.updateOrgMembership.useMutation({
    onSuccess: () => {
      utils.members.invalidate();
      showSuccessToast({
        title: "Saved",
        description: "Organization role updated successfully",
        duration: 2000,
      });
    },
  });

  return (
    <Select
      disabled={!hasCudAccess || mut.isLoading}
      value={currentRole}
      onValueChange={(value) =>
        mut.mutate({
          orgId,
          orgMembershipId,
          role: value as Role,
        })
      }
    >
      <SelectTrigger className="w-[120px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.values(Role).map((role) => (
          <SelectItem key={role} value={role}>
            {role.charAt(0).toUpperCase() + role.slice(1).toLowerCase()}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

const ProjectRoleDropdown = ({
  orgId,
  userId,
  orgMembershipId,
  projectId,
  currentProjectRole,
  hasCudAccess,
}: {
  orgMembershipId: string;
  userId: string;
  currentProjectRole: Role | null;
  orgId: string;
  projectId: string;
  hasCudAccess: boolean;
}) => {
  const utils = api.useUtils();
  const mut = api.members.updateProjectRole.useMutation({
    onSuccess: () => {
      utils.members.invalidate();
      showSuccessToast({
        title: "Saved",
        description: "Project role updated successfully",
        duration: 2000,
      });
    },
  });

  return (
    <Select
      disabled={!hasCudAccess || mut.isLoading}
      value={currentProjectRole ?? Role.NONE}
      onValueChange={(value) => {
        mut.mutate({
          orgId,
          orgMembershipId,
          projectId,
          userId,
          projectRole: value as Role,
        });
      }}
    >
      <SelectTrigger className="w-[120px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.values(Role).map((role) => (
          <SelectItem key={role} value={role}>
            {role.charAt(0).toUpperCase() + role.slice(1).toLowerCase()}
            {role === Role.NONE ? " (keep default role)" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
