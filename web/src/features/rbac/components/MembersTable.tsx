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
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { CreateProjectMemberButton } from "@/src/features/rbac/components/CreateProjectMemberButton";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { api } from "@/src/utils/api";
import { safeExtract } from "@/src/utils/map-utils";
import type { RouterOutput } from "@/src/utils/types";
import { Role } from "@langfuse/shared";
import { type Row } from "@tanstack/react-table";
import { Trash } from "lucide-react";
import { useSession } from "next-auth/react";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { RoleSelectItem } from "@/src/features/rbac/components/RoleSelectItem";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import { HoverCardPortal } from "@radix-ui/react-hover-card";
import Link from "next/link";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";
import { SettingsTableCard } from "@/src/components/layouts/settings-table-card";
import useSessionStorage from "@/src/components/useSessionStorage";
import { useTranslation } from "react-i18next";

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

export function MembersTable({
  orgId,
  project,
  showSettingsCard = false,
}: {
  orgId: string;
  project?: { id: string; name: string };
  showSettingsCard?: boolean;
}) {
  const { t } = useTranslation();
  // Create a unique key for this table's pagination state
  const paginationKey = project
    ? `projectMembers_${project.id}_pagination`
    : `orgMembers_${orgId}_pagination`;

  const session = useSession();
  const hasOrgViewAccess = useHasOrganizationAccess({
    organizationId: orgId,
    scope: "organizationMembers:read",
  });
  const hasProjectViewAccess =
    useHasProjectAccess({
      projectId: project?.id,
      scope: "projectMembers:read",
    }) || hasOrgViewAccess;
  const [paginationState, setPaginationState] = useSessionStorage(
    paginationKey,
    {
      pageIndex: 0,
      pageSize: 10,
    },
  );

  const membersViaOrg = api.members.allFromOrg.useQuery(
    {
      orgId,
      page: paginationState.pageIndex,
      limit: paginationState.pageSize,
    },
    {
      enabled: !project && hasOrgViewAccess,
    },
  );
  const membersViaProject = api.members.allFromProject.useQuery(
    {
      orgId,
      projectId: project?.id ?? "NOT ENABLED",
      page: paginationState.pageIndex,
      limit: paginationState.pageSize,
    },
    {
      enabled: project !== undefined && hasProjectViewAccess,
    },
  );
  const members = project ? membersViaProject : membersViaOrg;

  const totalCount = members.data?.totalCount ?? null;

  const utils = api.useUtils();

  const mutDeleteMember = api.members.deleteMembership.useMutation({
    onSuccess: (data) => {
      if (data.userId === session.data?.user?.id) void session.update();
      utils.members.invalidate();
    },
  });

  const hasCudAccessOrgLevel = useHasOrganizationAccess({
    organizationId: orgId,
    scope: "organizationMembers:CUD",
  });
  const hasCudAccessProjectLevel = useHasProjectAccess({
    projectId: project?.id,
    scope: "projectMembers:CUD",
  });

  const projectRolesEntitlement = useHasEntitlement("rbac-project-roles");

  const columns: LangfuseColumnDef<MembersTableRow>[] = [
    {
      accessorKey: "user",
      id: "user",
      header: t("rbac.membersTable.name"),
      cell: ({ row }) => {
        const { name, image } = row.getValue("user") as MembersTableRow["user"];
        return (
          <div className="flex items-center space-x-2">
            <Avatar className="h-7 w-7">
              <AvatarImage
                src={image ?? undefined}
                alt={name ?? t("rbac.membersTable.userAvatar")}
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
      header: t("rbac.membersTable.email"),
    },
    {
      accessorKey: "orgRole",
      id: "orgRole",
      header: t("rbac.membersTable.organizationRole"),
      headerTooltip: {
        description: t("rbac.membersTable.organizationRoleDescription"),
        href: "https://langfuse.com/docs/administration/rbac",
      },
      cell: ({ row }) => {
        const orgRole = row.getValue("orgRole") as MembersTableRow["orgRole"];
        const { orgMembershipId } = row.getValue(
          "meta",
        ) as MembersTableRow["meta"];
        const { userId } = row.getValue("meta") as MembersTableRow["meta"];
        const disableInProjectSettings = Boolean(project?.id);

        const ConfiguredOrgRoleDropdown = () => (
          <OrgRoleDropdown
            orgMembershipId={orgMembershipId}
            currentRole={orgRole}
            userId={userId}
            orgId={orgId}
            hasCudAccess={hasCudAccessOrgLevel && !disableInProjectSettings}
          />
        );

        return (
          <div className="relative">
            {disableInProjectSettings && hasCudAccessOrgLevel ? (
              <HoverCard openDelay={0} closeDelay={0}>
                <HoverCardTrigger>
                  <ConfiguredOrgRoleDropdown />
                </HoverCardTrigger>
                <HoverCardPortal>
                  <HoverCardContent
                    hideWhenDetached={true}
                    align="center"
                    side="right"
                  >
                    <p className="text-xs">
                      {
                        t("rbac.membersTable.organizationRoleTooltip").split(
                          "organization settings",
                        )[0]
                      }
                      <Link
                        href={`/organization/${orgId}/settings/members`}
                        className="underline"
                      >
                        {t("rbac.membersTable.organizationSettings")}
                      </Link>
                      .
                    </p>
                  </HoverCardContent>
                </HoverCardPortal>
              </HoverCard>
            ) : (
              <ConfiguredOrgRoleDropdown />
            )}
          </div>
        );
      },
    },
    ...(project
      ? [
          {
            accessorKey: "projectRole",
            id: "projectRole",
            header: t("rbac.membersTable.projectRole"),
            headerTooltip: {
              description: t("rbac.membersTable.projectRoleDescription"),
              href: "https://langfuse.com/docs/administration/rbac",
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

              if (!projectRolesEntitlement)
                return t("rbac.membersTable.naOnPlan");

              return (
                <ProjectRoleDropdown
                  orgMembershipId={orgMembershipId}
                  userId={userId}
                  currentProjectRole={projectRole ?? null}
                  orgId={orgId}
                  projectId={project.id}
                  hasCudAccess={
                    hasCudAccessOrgLevel || hasCudAccessProjectLevel
                  }
                />
              );
            },
          },
        ]
      : []),
    {
      accessorKey: "createdAt",
      id: "createdAt",
      header: t("rbac.membersTable.memberSince"),
      enableHiding: true,
      defaultHidden: true,
      cell: ({ row }) => {
        const value = row.getValue("createdAt") as MembersTableRow["createdAt"];
        return value ? new Date(value).toLocaleString() : undefined;
      },
    },
    {
      accessorKey: "meta",
      id: "meta",
      header: t("rbac.membersTable.actions"),
      enableHiding: false,
      cell: ({ row }) => {
        const { orgMembershipId, userId } = row.getValue(
          "meta",
        ) as MembersTableRow["meta"];
        return hasCudAccessOrgLevel ||
          (userId && userId === session.data?.user?.id) ? (
          <div className="flex space-x-2">
            <button
              onClick={() => {
                if (
                  confirm(
                    userId === session.data?.user?.id
                      ? t("rbac.membersTable.leaveOrganization")
                      : t("rbac.membersTable.removeMember"),
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
    useColumnVisibility<MembersTableRow>(
      project ? "membersColumnVisibilityProject" : "membersColumnVisibilityOrg",
      columns,
    );

  const [columnOrder, setColumnOrder] = useColumnOrder<MembersTableRow>(
    project ? "membersColumnOrderProject" : "membersColumnOrderOrg",
    columns,
  );

  const convertToTableRow = (
    orgMembership: RouterOutput["members"]["allFromOrg"]["memberships"][0], // type of both queries is the same
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

  if (project ? !hasProjectViewAccess : !hasOrgViewAccess) {
    return (
      <Alert>
        <AlertTitle>{t("rbac.membersTable.accessDenied")}</AlertTitle>
        <AlertDescription>
          {t("rbac.membersTable.noPermissionViewMembers")}
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
        columnOrder={columnOrder}
        setColumnOrder={setColumnOrder}
        actionButtons={
          <CreateProjectMemberButton orgId={orgId} project={project} />
        }
        className={showSettingsCard ? "px-0" : undefined}
      />
      {showSettingsCard ? (
        <SettingsTableCard>
          <DataTable
            tableName={project ? "projectMembers" : "orgMembers"}
            columns={columns}
            data={
              members.isPending
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
                      data: safeExtract(members.data, "memberships", []).map(
                        (t) => convertToTableRow(t),
                      ),
                    }
            }
            pagination={{
              totalCount,
              onChange: setPaginationState,
              state: paginationState,
            }}
            columnVisibility={columnVisibility}
            onColumnVisibilityChange={setColumnVisibility}
            columnOrder={columnOrder}
            onColumnOrderChange={setColumnOrder}
          />
        </SettingsTableCard>
      ) : (
        <DataTable
          tableName={project ? "projectMembers" : "orgMembers"}
          columns={columns}
          data={
            members.isPending
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
                    data: safeExtract(members.data, "memberships", []).map(
                      (t) => convertToTableRow(t),
                    ),
                  }
          }
          pagination={{
            totalCount,
            onChange: setPaginationState,
            state: paginationState,
          }}
          columnVisibility={columnVisibility}
          onColumnVisibilityChange={setColumnVisibility}
          columnOrder={columnOrder}
          onColumnOrderChange={setColumnOrder}
        />
      )}
    </>
  );
}

const OrgRoleDropdown = ({
  orgMembershipId,
  currentRole,
  orgId,
  userId,
  hasCudAccess,
}: {
  orgMembershipId: string;
  currentRole: Role;
  orgId: string;
  userId: string;
  hasCudAccess: boolean;
}) => {
  const utils = api.useUtils();
  const session = useSession();
  const mut = api.members.updateOrgMembership.useMutation({
    onSuccess: (data) => {
      utils.members.invalidate();
      if (data.userId === session.data?.user?.id) void session.update();
      showSuccessToast({
        title: t("rbac.membersTable.saved"),
        description: t("rbac.membersTable.orgRoleUpdated"),
        duration: 2000,
      });
    },
  });

  return (
    <Select
      disabled={!hasCudAccess || mut.isPending}
      value={currentRole}
      onValueChange={(value) => {
        if (
          userId !== session.data?.user?.id ||
          confirm(t("rbac.membersTable.changeOwnOrgRole"))
        ) {
          mut.mutate({
            orgId,
            orgMembershipId,
            role: value as Role,
          });
        }
      }}
    >
      <SelectTrigger className="w-[120px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.values(Role).map((role) => (
          <RoleSelectItem role={role} key={role} />
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
  const session = useSession();
  const mut = api.members.updateProjectRole.useMutation({
    onSuccess: (data) => {
      utils.members.invalidate();
      if (data.userId === session.data?.user?.id) void session.update();
      showSuccessToast({
        title: t("rbac.membersTable.saved"),
        description: t("rbac.membersTable.projectRoleUpdated"),
        duration: 2000,
      });
    },
  });

  return (
    <Select
      disabled={!hasCudAccess || mut.isPending}
      value={currentProjectRole ?? Role.NONE}
      onValueChange={(value) => {
        if (
          userId !== session.data?.user?.id ||
          confirm(t("rbac.membersTable.changeOwnProjectRole"))
        ) {
          mut.mutate({
            orgId,
            orgMembershipId,
            projectId,
            userId,
            projectRole: value as Role,
          });
        }
      }}
    >
      <SelectTrigger className="w-[120px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.values(Role).map((role) => (
          <RoleSelectItem role={role} key={role} isProjectRole />
        ))}
      </SelectContent>
    </Select>
  );
};
