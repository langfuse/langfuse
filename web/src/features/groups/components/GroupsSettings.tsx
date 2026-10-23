import { Fragment, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
} from "@langfuse/icons";
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
const roleLabel = (role: string) =>
  role === "NONE" ? "None" : role.charAt(0) + role.slice(1).toLowerCase();

const MAX_PROJECTS_IN_SUMMARY = 2;

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
              <TableHead>Members</TableHead>
              <TableHead>Grants</TableHead>
              <TableHead>Last synced</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!groups.isLoading && data.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
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
                    <TableCell className="py-3">
                      {isOpen ? (
                        <ChevronDown aria-hidden />
                      ) : (
                        <ChevronRight aria-hidden />
                      )}
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-bold">
                          {group.displayName}
                        </span>
                        <span className="text-muted-foreground font-mono text-xs">
                          {group.externalId
                            ? `IdP ID: ${group.externalId}`
                            : "No IdP ID"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3 text-sm whitespace-nowrap tabular-nums">
                      {group.members.length}{" "}
                      {group.members.length === 1 ? "member" : "members"}
                    </TableCell>
                    <TableCell className="py-3">
                      <GroupRolesSummary group={group} />
                    </TableCell>
                    <TableCell className="text-muted-foreground py-3 whitespace-nowrap">
                      {group.updatedAt.toLocaleString()}
                    </TableCell>
                  </TableRow>
                  {isOpen && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell />
                      <TableCell colSpan={4} className="pt-0 pb-4">
                        <div className="bg-muted/30 flex flex-col divide-y rounded-md border">
                          <div className="p-4">
                            <GroupRolesEditor
                              orgId={orgId}
                              group={group}
                              canEdit={canEditRoles}
                              canSetProjectRoles={hasProjectRoles}
                            />
                          </div>
                          <div className="p-4">
                            <GroupMembers group={group} />
                          </div>
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
  const organization = useQueryOrganization();
  if (!group.orgRole && group.projectRoles.length === 0) {
    return (
      <span className="text-muted-foreground text-sm">No roles mapped</span>
    );
  }
  const projectName = (projectId: string) =>
    organization?.projects.find((project) => project.id === projectId)?.name ??
    projectId;
  const shown = group.projectRoles.slice(0, MAX_PROJECTS_IN_SUMMARY);
  const hidden = group.projectRoles.slice(MAX_PROJECTS_IN_SUMMARY);
  return (
    <div className="flex flex-col gap-1 text-sm">
      <div>
        <span className="text-muted-foreground">Organization: </span>
        {group.orgRole ? roleLabel(group.orgRole) : "—"}
      </div>
      {shown.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-muted-foreground">Projects:</span>
          {shown.map((entry) => (
            <Badge key={entry.projectId} variant="outline">
              {projectName(entry.projectId)}: {roleLabel(entry.role)}
            </Badge>
          ))}
          {hidden.length > 0 && (
            <span
              className="text-muted-foreground text-xs"
              title={hidden
                .map((e) => `${projectName(e.projectId)}: ${roleLabel(e.role)}`)
                .join("\n")}
            >
              +{hidden.length} more
            </span>
          )}
        </div>
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
      <div>
        <h3 className="text-sm font-bold">Roles</h3>
        <p className="text-muted-foreground text-xs">
          Members get the highest of their own role and the roles of all their
          groups.
        </p>
      </div>
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
              <span className="text-muted-foreground flex w-40 items-center gap-1 text-sm">
                <Plus aria-hidden />
                Add project
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
      <div>
        <h3 className="text-sm font-bold">Members ({group.members.length})</h3>
        <p className="text-muted-foreground text-xs">
          Managed by your identity provider.
        </p>
      </div>
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
              <TableHead>Direct org role</TableHead>
              <TableHead>Org role from groups</TableHead>
              <TableHead>Effective org role</TableHead>
              <TableHead>Added</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {group.members.map((member) => (
              <TableRow key={member.userId}>
                <TableCell className="py-2.5">{member.name ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground py-2.5">
                  {member.email ?? "—"}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {roleLabel(member.directOrgRole)}
                  </Badge>
                </TableCell>
                <TableCell>
                  {member.groupOrgRole ? (
                    <Badge variant="outline">
                      {roleLabel(member.groupOrgRole)}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="tertiary">
                    {roleLabel(member.effectiveOrgRole)}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
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
