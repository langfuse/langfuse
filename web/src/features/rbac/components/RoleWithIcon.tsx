import { type Role } from "@langfuse/shared";

import { roleName } from "@/src/features/rbac/components/roleDisplay";
import { roleIcons } from "@/src/features/rbac/components/roleIcons";

export function RoleWithIcon({ role }: { role: Role }) {
  const Icon = roleIcons[role];
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon size="sm" aria-hidden="true" />
      {roleName(role)}
    </span>
  );
}
