import Link from "next/link";
import { useSession } from "next-auth/react";
import { AlertCircle, Trash2 } from "@langfuse/icons";
import { projectRoleAccessRights } from "@langfuse/shared";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import Header from "@/src/components/layouts/header";
import { Card } from "@/src/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import {
  hasProjectAccess,
  useHasProjectAccess,
} from "@/src/features/rbac/utils/checkProjectAccess";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { api, type RouterOutputs } from "@/src/utils/api";

type ProjectGroup = RouterOutputs["groups"]["projectList"][number];
type GroupRole = "ADMIN" | "MEMBER" | "VIEWER";

const GROUP_ROLES: GroupRole[] = ["VIEWER", "MEMBER", "ADMIN"];
const roleLabel = (role: string) =>
  role.charAt(0) + role.slice(1).toLowerCase();
const higherRoleReason = "You cannot grant a role higher than your own";

// Project admins map the org's SCIM groups to a role on this project. Groups
// and members stay owned by the IdP; org-wide group roles are set in the
// organization settings and shown here read-only.
export function ProjectGroupsSettings({
  orgId,
  projectId,
}: {
  orgId: string;
  projectId: string;
}) {
  const session = useSession();
  const hasAdminApi = useHasEntitlement("admin-api");
  const hasProjectRoles = useHasEntitlement("rbac-project-roles");
  const canRead = useHasProjectAccess({
    projectId,
    scope: "projectMembers:read",
  });
  const canEdit =
    useHasProjectAccess({ projectId, scope: "projectMembers:CUD" }) &&
    hasProjectRoles;
  const utils = api.useUtils();

  const groups = api.groups.projectList.useQuery(
    { projectId },
    { enabled: hasAdminApi && canRead },
  );
  const setRole = api.groups.setProjectRole.useMutation({
    onSuccess: (_, input) => {
      utils.groups.invalidate().catch(() => undefined);
      utils.members.invalidate().catch(() => undefined);
      const name =
        groups.data?.find((group) => group.id === input.groupId)?.displayName ??
        "Group";
      showSuccessToast({
        operation: "group_project_role.update",
        title: input.role ? "Group role saved" : "Group removed",
        description: input.role
          ? `${name} is now ${roleLabel(input.role)} on this project`
          : `${name} no longer has a role on this project`,
        duration: 2000,
      });
    },
  });

  // A role can be granted or taken away only if you hold all of its permissions.
  const canGrant = (role: GroupRole) =>
    projectRoleAccessRights[role].every((scope) =>
      hasProjectAccess({ session: session.data, projectId, scope }),
    );

  const heading = (
    <>
      <Header title="Groups" />
      <p className="text-muted-foreground mb-4 text-sm">
        Give groups from your identity provider a role on this project. Members
        keep their own role and gain the group role&apos;s permissions on top.
        Group names and members are managed in your identity provider; org-wide
        group roles are set in{" "}
        <Link
          href={`/organization/${orgId}/settings/groups`}
          className="underline"
        >
          organization settings
        </Link>
        .
      </p>
    </>
  );

  if (!hasAdminApi) {
    return (
      <div>
        {heading}
        <Alert icon={AlertCircle}>
          <Alert.Title>Not available</Alert.Title>
          <Alert.Description>
            SCIM provisioning is not available on your plan.
          </Alert.Description>
        </Alert>
      </div>
    );
  }
  if (!canRead) {
    return (
      <div>
        {heading}
        <Alert>
          <Alert.Title>Access Denied</Alert.Title>
          <Alert.Description>
            You do not have permission to view the members of this project.
          </Alert.Description>
        </Alert>
      </div>
    );
  }

  const data = groups.data ?? [];
  const withAccess = data.filter((group) => group.projectRole || group.orgRole);
  const addable = data.filter((group) => !group.projectRole);
  const isPending = (groupId: string) =>
    setRole.isPending && setRole.variables?.groupId === groupId;

  const roleOptions = (current: string | null) =>
    GROUP_ROLES.map((role) =>
      canGrant(role) || role === current
        ? { value: role, label: roleLabel(role) }
        : {
            value: role,
            label: roleLabel(role),
            disabled: true as const,
            disabledReason: higherRoleReason,
          },
    );

  return (
    <div className="flex flex-col gap-4">
      <div>{heading}</div>

      {!hasProjectRoles && (
        <Alert icon={AlertCircle}>
          <Alert.Title>
            Project roles are not available on your plan
          </Alert.Title>
          <Alert.Description>
            Groups can still get access through their org-wide role.
          </Alert.Description>
        </Alert>
      )}
      {groups.error && (
        <Alert icon={AlertCircle}>
          <Alert.Title>Could not load groups</Alert.Title>
          <Alert.Description>{groups.error.message}</Alert.Description>
        </Alert>
      )}
      {setRole.error && (
        <Alert icon={AlertCircle}>
          <Alert.Title>Could not save the group role</Alert.Title>
          <Alert.Description>{setRole.error.message}</Alert.Description>
        </Alert>
      )}

      {canEdit && addable.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm">Add a group to this project</span>
          <div className="w-72">
            <SelectInput
              aria-label="Add a group to this project"
              placeholder="Select a group"
              search={{ placeholder: "Search groups" }}
              value=""
              options={addable.map((group) => ({
                value: group.id,
                label: group.displayName,
              }))}
              disabled={setRole.isPending || !canGrant("VIEWER")}
              onValueChange={(groupId) =>
                setRole.mutate({ projectId, groupId, role: "VIEWER" })
              }
            />
          </div>
          <span className="text-muted-foreground text-xs">
            Added groups start as Viewer.
          </span>
        </div>
      )}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Group</TableHead>
              <TableHead>Members</TableHead>
              <TableHead>Role on this project</TableHead>
              <TableHead>Org-wide role</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!groups.isLoading && withAccess.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-muted-foreground py-8 text-center"
                >
                  {data.length === 0
                    ? "No groups have been pushed by your identity provider yet."
                    : "No group has access to this project yet."}
                </TableCell>
              </TableRow>
            )}
            {withAccess.map((group) => (
              <ProjectGroupRow
                key={group.id}
                group={group}
                canEdit={canEdit}
                pending={isPending(group.id)}
                roleOptions={roleOptions(group.projectRole)}
                canRemove={
                  group.projectRole !== null &&
                  canGrant(group.projectRole as GroupRole)
                }
                onChange={(role) =>
                  setRole.mutate({ projectId, groupId: group.id, role })
                }
              />
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function ProjectGroupRow({
  group,
  canEdit,
  pending,
  roleOptions,
  canRemove,
  onChange,
}: {
  group: ProjectGroup;
  canEdit: boolean;
  pending: boolean;
  roleOptions: React.ComponentProps<
    typeof SelectInput<GroupRole | "NONE">
  >["options"];
  canRemove: boolean;
  onChange: (role: GroupRole | null) => void;
}) {
  return (
    <TableRow>
      <TableCell className="py-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-bold">{group.displayName}</span>
          <span className="text-muted-foreground font-mono text-xs">
            {group.externalId ? `IdP ID: ${group.externalId}` : "No IdP ID"}
          </span>
        </div>
      </TableCell>
      <TableCell className="py-3 text-sm whitespace-nowrap tabular-nums">
        {group.memberCount} {group.memberCount === 1 ? "member" : "members"}
      </TableCell>
      <TableCell className="py-3">
        <div className="w-44">
          <SelectInput<GroupRole | "NONE">
            aria-label={`Role of ${group.displayName} on this project`}
            placeholder="Select a role"
            value={(group.projectRole as GroupRole | null) ?? "NONE"}
            options={[
              { value: "NONE", label: "No project role" },
              ...(roleOptions ?? []),
            ]}
            disabled={!canEdit || pending}
            onValueChange={(role) => onChange(role === "NONE" ? null : role)}
          />
        </div>
      </TableCell>
      <TableCell className="py-3">
        {group.orgRole ? (
          <Badge
            color="outline"
            text={`${roleLabel(group.orgRole)} (all projects)`}
          />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="py-3">
        {canEdit && group.projectRole && (
          <IconButton
            variant="ghost"
            icon={Trash2}
            label={`Remove ${group.displayName} from this project`}
            disabled={pending || !canRemove}
            onClick={() => onChange(null)}
          />
        )}
      </TableCell>
    </TableRow>
  );
}
