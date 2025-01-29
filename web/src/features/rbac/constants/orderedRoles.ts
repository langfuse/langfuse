import { Role } from "@langfuse/shared";

export const orderedRoles: Record<Role, number> = {
  [Role.OWNER]: 4,
  [Role.ADMIN]: 3,
  [Role.MEMBER]: 2,
  [Role.VIEWER]: 1,
  [Role.NONE]: 0,
};
