import { DataTable } from "@/src/components/table/data-table";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { Avatar } from "@/src/components/design-system/Avatar/Avatar";
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { ActionButton } from "@/src/components/ActionButton";
import { CreateProjectMemberDialogController } from "@/src/features/rbac/components/CreateProjectMemberDialogController";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { api } from "@/src/utils/api";
import { safeExtract } from "@/src/utils/map-utils";
import type { RouterOutput } from "@/src/utils/types";
import { Role } from "@langfuse/shared";
import { PlusIcon, Trash } from "lucide-react";
import { useSession } from "next-auth/react";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { showSuccessToast } from "@/src/features/notifications";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { RoleSelectItem } from "@/src/features/rbac/components/RoleSelectItem";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  HoverCardPortal,
} from "@/src/components/ui/hover-card";
import Link from "next/link";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { SettingsTableCard } from "@/src/components/layouts/settings-table-card";
import useSessionStorage from "@/src/components/useSessionStorage";
import { useQueryParam, withDefault, StringParam } from "use-query-params";
import { useEffect } from "react";
import { UserFeaturePreviewsControl } from "@/src/features/feature-flags/components/UserFeaturePreviewsPopover";
import type { FeaturePreviewFlag } from "@/src/features/feature-flags/available-flags";
import { env } from "@/src/env.mjs";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { Button } from "@/src/components/ui/button";
import { Popover, PopoverTrigger } from "@/src/components/ui/popover";

export type MembersTableRow = {
  user: {
    image: string | null;
    name: string | null;
  };
  email: string | null;
  providers: string[];
  createdAt: Date;
  orgRole: Role;
  projectRole?: Role;
  featurePreviews: Record<FeaturePreviewFlag, boolean> | null;
  featurePreviewManagement:
    | RouterOutput["members"]["allFromOrg"]["memberships"][number]["featurePreviewManagement"]
    | null;
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

  const [searchQuery, setSearchQuery] = useQueryParam(
    "search",
    withDefault(StringParam, null),
  );

  useEffect(() => {
    setPaginationState((prev) => ({
      pageIndex: 0,
      pageSize: prev.pageSize,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const membersViaOrg = api.members.allFromOrg.useQuery(
    {
      orgId,
      searchQuery: searchQuery ?? undefined,
      page: paginationState.pageIndex,
      limit: paginationState.pageSize,
    },
    {
      enabled: !project && hasOrgViewAccess,
    },
  );
  const membersViaProject = api.members.allFromProject.useQuery(
    {
      projectId: project?.id ?? "NOT ENABLED",
      searchQuery: searchQuery ?? undefined,
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
      if (data.userId === session.data?.user?.id) session.update();
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
      header: "Name",
      cell: ({ row }) => {
        const { name, image } = row.getValue("user") as MembersTableRow["user"];
        return (
          <div className="flex items-center space-x-2">
            <Avatar
              size="md"
              src={image ?? undefined}
              displayName={name ?? "User"}
            />
            <span>{name}</span>
          </div>
        );
      },
    },
    createTextTableColumn<MembersTableRow>({
      accessorKey: "email",
      header: "Email",
    }),
    createTextTableColumn<MembersTableRow, string[]>({
      accessorKey: "providers",
      header: "SSO Provider",
      enableHiding: true,
      mapValue: (providers) => (providers?.length ? providers.join(", ") : "-"),
    }),
    {
      accessorKey: "orgRole",
      id: "orgRole",
      header: "Organization Role",
      headerTooltip: {
        description:
          "The org-role is the default role for this user in this organization and applies to the organization and all its projects.",
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
                      The organization-level role can be edited in the{" "}
                      <Link
                        href={`/organization/${orgId}/settings/members`}
                        className="underline"
                      >
                        organization settings
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
      ? ([
          {
            accessorKey: "projectRole",
            id: "projectRole",
            header: "Project Role",
            headerTooltip: {
              description:
                "The role for this user in this specific project. This role overrides the default project role.",
              href: "https://langfuse.com/docs/administration/rbac",
            },
            cell: ({ row }) => {
              const projectRole = row.getValue(
                "projectRole",
              ) as MembersTableRow["projectRole"];
              const { orgMembershipId, userId } = row.getValue(
                "meta",
              ) as MembersTableRow["meta"];

              if (!projectRolesEntitlement) return "N/A on plan";

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
        ] satisfies LangfuseColumnDef<MembersTableRow>[])
      : []),
    ...(!project &&
    hasCudAccessOrgLevel &&
    orgId !== env.NEXT_PUBLIC_DEMO_ORG_ID
      ? ([
          {
            accessorKey: "featurePreviews",
            id: "featurePreviews",
            header: "Feature Previews",
            enableHiding: true,
            cell: ({ row }) => {
              const { featurePreviews, featurePreviewManagement, meta } =
                row.original;
              if (!featurePreviews || !featurePreviewManagement) return null;

              return (
                <Popover>
                  <UserFeaturePreviewsControl
                    orgId={orgId}
                    userId={meta.userId}
                    featurePreviews={featurePreviews}
                    management={featurePreviewManagement}
                  >
                    {({ enabledCount, totalCount, content }) => (
                      <>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm">
                            {enabledCount}/{totalCount} enabled
                          </Button>
                        </PopoverTrigger>
                        {content}
                      </>
                    )}
                  </UserFeaturePreviewsControl>
                </Popover>
              );
            },
          },
        ] satisfies LangfuseColumnDef<MembersTableRow>[])
      : []),
    createDateTableColumn<MembersTableRow>({
      accessorKey: "createdAt",
      header: "Member Since",
      enableHiding: true,
      defaultHidden: true,
    }),
    {
      accessorKey: "meta",
      id: "meta",
      header: "Actions",
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
    useColumnVisibility<MembersTableRow>(
      project ? "membersColumnVisibilityProject" : "membersColumnVisibilityOrg",
      columns,
    );

  const [columnOrder, setColumnOrder] = useColumnOrder<MembersTableRow>(
    project ? "membersColumnOrderProject" : "membersColumnOrderOrg",
    columns,
  );

  const convertToTableRow = (
    orgMembership:
      | RouterOutput["members"]["allFromOrg"]["memberships"][number]
      | RouterOutput["members"]["allFromProject"]["memberships"][number],
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
      providers: orgMembership.user.accounts?.map((a) => a.provider) ?? [],
      createdAt: orgMembership.createdAt,
      orgRole: orgMembership.role,
      projectRole: orgMembership.projectRole,
      featurePreviews:
        "featurePreviews" in orgMembership
          ? orgMembership.featurePreviews
          : null,
      featurePreviewManagement:
        "featurePreviewManagement" in orgMembership
          ? orgMembership.featurePreviewManagement
          : null,
    };
  };

  if (project ? !hasProjectViewAccess : !hasOrgViewAccess) {
    return (
      <Alert>
        <Alert.Title>Access Denied</Alert.Title>
        <Alert.Description>
          You do not have permission to view members of this organization.
        </Alert.Description>
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
          <CreateProjectMemberDialogController orgId={orgId} project={project}>
            {({
              hasAccess,
              hasOnlySingleProjectAccess,
              isSubmitting,
              usageLimit,
              Trigger,
            }) => (
              <Trigger asChild>
                <ActionButton
                  variant="secondary"
                  loading={isSubmitting}
                  hasAccess={hasAccess}
                  usageLimit={usageLimit}
                  icon={<PlusIcon className="h-5 w-5" aria-hidden="true" />}
                >
                  {hasOnlySingleProjectAccess
                    ? "Add project member"
                    : "Add new member"}
                </ActionButton>
              </Trigger>
            )}
          </CreateProjectMemberDialogController>
        }
        searchConfig={{
          metadataSearchFields: ["Name", "Email"],
          updateQuery: setSearchQuery,
          currentQuery: searchQuery ?? undefined,
          tableAllowsFullTextSearch: false,
          setSearchType: undefined,
          searchType: undefined,
        }}
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
            cellPadding="comfortable"
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
          cellPadding="comfortable"
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
      if (data.userId === session.data?.user?.id) session.update();
      showSuccessToast({
        title: "Saved",
        description: "Organization role updated successfully",
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
          confirm(
            "Are you sure that you want to change your own organization role?",
          )
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
      if (data.userId === session.data?.user?.id) session.update();
      showSuccessToast({
        title: "Saved",
        description: "Project role updated successfully",
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
          confirm("Are you sure that you want to change your own project role?")
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
