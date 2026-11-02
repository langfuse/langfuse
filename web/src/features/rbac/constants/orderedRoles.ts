import { type Role } from "@langfuse/shared/src/db";

export const orderedRoles: Record<Role, number> = {
  OWNER: 5,
  ADMIN: 4,
  MEMBER: 3,
  VIEWER: 2,
  AI_GATEWAY: 1,
  NONE: 0,
};
