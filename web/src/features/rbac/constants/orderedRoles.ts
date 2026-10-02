import { type Role } from "@langfuse/shared/src/db";

export const orderedRoles: Record<Role, number> = {
  OWNER: 4,
  ADMIN: 3,
  MEMBER: 2,
  VIEWER: 1,
  NONE: 0,
};
