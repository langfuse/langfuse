// PROTOTYPE — throwaway. Shared rendering of a role's full permission list and
// the system-role footnote, reused across every "show permissions" variant.

import { Badge } from "@/src/components/ui/badge";
import { cn } from "@/src/utils/tailwind";
import {
  type PermissionDomain,
  type PresetKey,
  describeResource,
  groupByKind,
  permissionDomains,
  resolvePreset,
} from "../prototype/permissionCatalog";

/** rolePermissionGroups returns every resource + action a role grants, grouped by resource. */
export const rolePermissionGroups = (
  preset: PresetKey,
): RolePermissionGroup[] =>
  groupByKind(resolvePreset(preset, [])).map(({ kind, actions }) => ({
    domain: kind.domain,
    resource: kind.resource,
    label: kind.label,
    description: describeResource(kind.resource),
    actions,
  }));

/** rolePermissionCount returns how many individual permissions a role grants. */
export const rolePermissionCount = (preset: PresetKey): number =>
  rolePermissionGroups(preset).reduce((n, g) => n + g.actions.length, 0);

/** RolePermissionList renders a role's full permission set, grouped by domain then resource. */
export const RolePermissionList = ({
  preset,
  dense,
}: {
  preset: PresetKey;
  dense?: boolean;
}) => {
  const groups = rolePermissionGroups(preset);

  if (groups.length === 0)
    return (
      <p className="text-muted-foreground text-sm italic">
        No permissions granted.
      </p>
    );

  return (
    <div className="flex flex-col gap-4">
      {permissionDomains.map((domain) => {
        const domainGroups = groups.filter((g) => g.domain === domain.key);
        if (domainGroups.length === 0) return null;
        return (
          <div key={domain.key} className="flex flex-col gap-2">
            <span className="text-muted-foreground text-[0.65rem] font-bold tracking-wider uppercase">
              {domain.label}
            </span>
            <div className="flex flex-col gap-2">
              {domainGroups.map((g) => (
                <ResourceRow key={g.resource} group={g} dense={dense} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/** SystemRolesFootnote is the fine print shown under every variant. */
export const SystemRolesFootnote = () => (
  <p className="text-muted-foreground text-xs leading-relaxed">
    These are system roles managed by Langfuse and are subject to change as new
    features are released.
  </p>
);

const ResourceRow = ({
  group,
  dense,
}: {
  group: RolePermissionGroup;
  dense?: boolean;
}) => (
  <div className={cn("flex gap-3", dense ? "items-center" : "items-start")}>
    <div className="flex min-w-0 flex-1 flex-col">
      <span className="text-sm leading-tight font-bold">{group.label}</span>
      {!dense && group.description && (
        <span className="text-muted-foreground text-xs leading-tight">
          {group.description}
        </span>
      )}
    </div>
    <div className="flex shrink-0 flex-wrap justify-end gap-1">
      {group.actions.map((a) => (
        <Badge
          key={a}
          variant="outline"
          className="px-1.5 py-0 font-mono text-[0.65rem] font-normal"
        >
          {a}
        </Badge>
      ))}
    </div>
  </div>
);

/** RolePermissionGroup is one resource's granted actions within a role. */
export type RolePermissionGroup = {
  domain: PermissionDomain;
  resource: string;
  label: string;
  description: string;
  actions: string[];
};
