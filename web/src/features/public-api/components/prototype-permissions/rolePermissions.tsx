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
    <div className={cn("flex flex-col", dense ? "gap-2.5" : "gap-4")}>
      {permissionDomains.map((domain) => {
        const domainGroups = groups.filter((g) => g.domain === domain.key);
        if (domainGroups.length === 0) return null;
        return (
          <div
            key={domain.key}
            className={cn("flex flex-col", dense ? "gap-1" : "gap-2")}
          >
            <span
              className={cn(
                "text-muted-foreground font-bold tracking-wider uppercase",
                dense ? "text-[0.6rem]" : "text-[0.65rem]",
              )}
            >
              {domain.label}
            </span>
            <div className={cn("flex flex-col", dense ? "gap-0.5" : "gap-2")}>
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

const ResourceRow = ({
  group,
  dense,
}: {
  group: RolePermissionGroup;
  dense?: boolean;
}) => (
  <div className="flex items-start gap-3">
    <div className={cn("shrink-0", dense ? "max-w-[40%]" : "w-40")}>
      <span
        className={cn(
          "block leading-[1.1] font-bold",
          dense ? "text-xs" : "text-sm",
        )}
      >
        {group.label}
      </span>
      {!dense && group.description && (
        <span className="text-muted-foreground block text-xs leading-tight">
          {group.description}
        </span>
      )}
    </div>
    <div className="flex min-w-0 flex-1 flex-wrap justify-end gap-1">
      {group.actions.map((a) => (
        <Badge
          key={a}
          variant="outline"
          className={cn(
            "font-mono font-normal",
            dense ? "px-1 py-0 text-[0.55rem]" : "px-1.5 py-0 text-[0.65rem]",
          )}
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
