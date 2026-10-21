import { Fragment, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
} from "lucide-react";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/design-system/Button/Button";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import Header from "@/src/components/layouts/header";
import { Badge } from "@/src/components/ui/badge";
import { Card } from "@/src/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { useHasEntitlement } from "@/src/features/entitlements";
import { useHasOrganizationAccess } from "@/src/features/rbac";
import { useQueryOrganization } from "@/src/features/organizations/hooks";
import { showSuccessToast } from "@/src/features/notifications";
import { api, type RouterOutputs } from "@/src/utils/api";

type Group = RouterOutputs["groups"]["list"][number];
type GroupRole = "ADMIN" | "MEMBER" | "VIEWER";

const ROLE_OPTIONS: { value: GroupRole; label: string }[] = [
  { value: "VIEWER", label: "Viewer" },
  { value: "MEMBER", label: "Member" },
  { value: "ADMIN", label: "Admin" },
];
const ORG_ROLE_OPTIONS: { value: GroupRole | "NONE"; label: string }[] = [
  { value: "NONE", label: "No organization role" },
  ...ROLE_OPTIONS,
];

// Groups and their members are owned by the IdP (SCIM) and read-only here. Org
// admins only map each group to roles; group roles add to what members hold
// directly and never lower it.
export function GroupsSettings({ orgId }: { orgId: string }) {
  const hasEntitlement = useHasEntitlement("admin-api");
  const hasAccess = useHasOrganizationAccess({
    organizationId: orgId,
    scope: "organizationMembers:read",
  });
  const canEditRoles = useHasOrganizationAccess({
    organizationId: orgId,
    scope: "organizationMembers:CUD",
  });
  const hasProjectRoles = useHasEntitlement("rbac-project-roles");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const groups = api.groups.list.useQuery(
    { orgId },
    { enabled: hasEntitlement && hasAccess },
  );

  const heading = (
    <>
      <Header title="Groups" />
      <p className="text-muted-foreground mb-4 text-sm">
        Groups synced from your identity provider (e.g. Okta Group Push or Entra
        ID provisioning) through SCIM. Group names and members are managed in
        your identity provider. Here you map each group to roles: they add to
        the roles members already have and never lower them.
      </p>
    </>
  );

  if (!hasEntitlement) {
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

  if (!hasAccess) {
    return (
      <div>
        {heading}
        <Alert>
          <Alert.Title>Access Denied</Alert.Title>
          <Alert.Description>
            You do not have permission to view the members of this organization.
          </Alert.Description>
        </Alert>
      </div>
    );
  }

  const data = groups.data ?? [];

  const toggle = (groupId: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });

  return (
    <div>
      {heading}

      {groups.error && (
        <div className="mb-4">
          <Alert icon={AlertCircle}>
            <Alert.Title>Could not load groups</Alert.Title>
            <Alert.Description>{groups.error.message}</Alert.Description>
          </Alert>
        </div>
      )}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Group</TableHead>
              <TableHead>External ID</TableHead>
              <TableHead>Members</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Last change</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!groups.isLoading && data.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-muted-foreground py-8 text-center"
                >
                  No groups have been pushed by your identity provider yet.
                </TableCell>
              </TableRow>
            )}
            {data.map((group) => {
              const isOpen = expanded.has(group.id);
              return (
                <Fragment key={group.id}>
                  <TableRow
                    className="cursor-pointer"
                    onClick={() => toggle(group.id)}
                  >
                    <TableCell>
                      {isOpen ? (
                        <ChevronDown className="icon-base" />
                      ) : (
                        <ChevronRight className="icon-base" />
                      )}
                    </TableCell>
                    <TableCell className="font-bold">
                      {group.displayName}
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {group.externalId ?? "—"}
                    </TableCell>
                    <TableCell>{group.members.length}</TableCell>
                    <TableCell>
                      <GroupRolesSummary group={group} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {group.updatedAt.toLocaleString()}
                    </TableCell>
                  </TableRow>
                  {isOpen && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell />
                      <TableCell colSpan={5} className="pb-4">
                        <div className="flex flex-col gap-6">
                          <GroupRolesEditor
                            orgId={orgId}
                            group={group}
                            canEdit={canEditRoles}
                            canSetProjectRoles={hasProjectRoles}
                          />
                          <GroupMembers group={group} />
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function GroupRolesSummary({ group }: { group: Group }) {
  if (!group.orgRole && group.projectRoles.length === 0) {
    return <Badge variant="outline">No roles mapped</Badge>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {group.orgRole && (
        <Badge variant="tertiary">Organization: {group.orgRole}</Badge>
      )}
      {group.projectRoles.length > 0 && (
        <Badge variant="tertiary">
          {group.projectRoles.length}{" "}
          {group.projectRoles.length === 1 ? "project" : "projects"}
        </Badge>
      )}
    </div>
  );
}

function GroupRolesEditor({
  orgId,
  group,
  canEdit,
  canSetProjectRoles,
}: {
  orgId: string;
  group: Group;
  canEdit: boolean;
  canSetProjectRoles: boolean;
}) {
  const organization = useQueryOrganization();
  const projects = organization?.projects ?? [];
  const utils = api.useUtils();

  const [orgRole, setOrgRole] = useState<GroupRole | "NONE">(
    (group.orgRole as GroupRole | null) ?? "NONE",
  );
  const [projectRoles, setProjectRoles] = useState<
    { projectId: string; role: GroupRole }[]
  >(
    group.projectRoles.map((r) => ({
      projectId: r.projectId,
      role: r.role as GroupRole,
    })),
  );

  const save = api.groups.setRoleAssignments.useMutation({
    onSuccess: () => {
      utils.groups.invalidate();
      showSuccessToast({
        operation: "group_roles.update",
        title: "Saved",
        description: `Roles of ${group.displayName} updated`,
        duration: 2000,
      });
    },
  });

  const unusedProjects = projects.filter(
    (project) => !projectRoles.some((r) => r.projectId === project.id),
  );
  const projectName = (projectId: string) =>
    projects.find((project) => project.id === projectId)?.name ?? projectId;

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-bold">Roles</h3>
      <div className="flex items-center gap-3">
        <span className="w-40 text-sm">Organization</span>
        <div className="w-56">
          <SelectInput
            aria-label="Organization role"
            placeholder="Select a role"
            value={orgRole}
            options={ORG_ROLE_OPTIONS}
            onValueChange={setOrgRole}
            disabled={!canEdit}
          />
        </div>
      </div>

      {canSetProjectRoles && (
        <>
          {projectRoles.map((entry) => (
            <div key={entry.projectId} className="flex items-center gap-3">
              <span
                className="w-40 truncate text-sm"
                title={projectName(entry.projectId)}
              >
                {projectName(entry.projectId)}
              </span>
              <div className="w-56">
                <SelectInput
                  aria-label={`Role on ${projectName(entry.projectId)}`}
                  placeholder="Select a role"
                  value={entry.role}
                  options={ROLE_OPTIONS}
                  onValueChange={(role) =>
                    setProjectRoles((prev) =>
                      prev.map((r) =>
                        r.projectId === entry.projectId ? { ...r, role } : r,
                      ),
                    )
                  }
                  disabled={!canEdit}
                />
              </div>
              {canEdit && (
                <IconButton
                  variant="ghost"
                  icon={Trash2}
                  label="Remove project role"
                  onClick={() =>
                    setProjectRoles((prev) =>
                      prev.filter((r) => r.projectId !== entry.projectId),
                    )
                  }
                />
              )}
            </div>
          ))}
          {canEdit && unusedProjects.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="w-40 text-sm">
                <Plus className="icon-base inline" /> Add project
              </span>
              <div className="w-56">
                <SelectInput
                  aria-label="Add project role"
                  placeholder="Select a project"
                  search={{ placeholder: "Search projects" }}
                  value=""
                  options={unusedProjects.map((project) => ({
                    value: project.id,
                    label: project.name,
                  }))}
                  onValueChange={(projectId) =>
                    setProjectRoles((prev) => [
                      ...prev,
                      { projectId, role: "VIEWER" },
                    ])
                  }
                />
              </div>
            </div>
          )}
        </>
      )}

      {save.error && (
        <p className="text-destructive text-sm">{save.error.message}</p>
      )}
      {canEdit && (
        <div>
          <Button
            text="Save roles"
            loading={save.isPending}
            onClick={() =>
              save.mutate({
                orgId,
                groupId: group.id,
                orgRole: orgRole === "NONE" ? null : orgRole,
                projectRoles,
              })
            }
          />
        </div>
      )}
    </div>
  );
}

function GroupMembers({ group }: { group: Group }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-bold">
        Members (managed by your identity provider)
      </h3>
      {group.members.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          This group has no members.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Direct organization role</TableHead>
              <TableHead>Added</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {group.members.map((member) => (
              <TableRow key={member.userId}>
                <TableCell>{member.name ?? "—"}</TableCell>
                <TableCell>{member.email ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant="tertiary">{member.orgRole}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {member.addedAt.toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
