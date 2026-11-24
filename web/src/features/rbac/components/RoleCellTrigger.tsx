import { ChevronRight, Users } from "@langfuse/icons";
import { type Role } from "@langfuse/shared";

import { roleName } from "@/src/features/rbac/components/roleDisplay";

/** A role cell that opens a dialog: the role as link-coloured text with an arrow. */
export function RoleCellTrigger({
  roles,
  label,
  groupHint,
  onClick,
}: {
  roles: Role[];
  label: string;
  /** Shows the people icon, with this as hover text. */
  groupHint?: string;
  onClick: () => void;
}) {
  const names = roles.map(roleName).join(" + ");
  const hoverText = groupHint ? `${names} · ${groupHint}` : names;
  return (
    <button
      type="button"
      className="text-link hover:text-link-hover focus-visible:ring-ring inline-flex max-w-55 items-center gap-1 rounded-sm text-left focus-visible:ring-2 focus-visible:outline-hidden"
      aria-label={label}
      title={hoverText}
      onClick={onClick}
    >
      <span className="min-w-0 truncate" title={hoverText}>
        {names}
      </span>
      {groupHint && (
        <span className="inline-flex shrink-0">
          <Users size="sm" aria-hidden="true" />
        </span>
      )}
      <span className="inline-flex shrink-0">
        <ChevronRight size="sm" aria-hidden="true" />
      </span>
    </button>
  );
}
