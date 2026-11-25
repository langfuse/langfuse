import { ChevronRight, Users } from "@langfuse/icons";
import { type Role } from "@langfuse/shared";

import { roleName } from "@/src/features/rbac/components/roleDisplay";

export function RoleCellTrigger({
  roles,
  label,
  groupHint,
  onClick,
}: {
  roles: Role[];
  label: string;
  groupHint?: string;
  onClick: () => void;
}) {
  const names = roles.map(roleName).join(" + ");
  const hoverText = groupHint ? `${names} · ${groupHint}` : names;
  return (
    <button
      type="button"
      className="text-link hover:text-link-hover focus-visible:ring-ring ph-no-capture inline-flex max-w-full items-center gap-1 rounded-sm text-left focus-visible:ring-2 focus-visible:outline-hidden"
      aria-label={label}
      onClick={onClick}
    >
      <span className="min-w-0 truncate" title={hoverText}>
        {names}
      </span>
      {groupHint && <Users size="sm" aria-hidden="true" />}
      <ChevronRight size="sm" aria-hidden="true" />
    </button>
  );
}
