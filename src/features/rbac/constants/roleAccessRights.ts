import { type MembershipRole } from "@prisma/client";

const resourcesAndActions = {
  members: ["read", "create", "delete"],
} as const;

// type string of all Resource:Action, e.g. "members:read"
export type Scope =
  `${keyof typeof resourcesAndActions}:${(typeof resourcesAndActions)[keyof typeof resourcesAndActions][number]}`;

export const roleAccessRights: Record<MembershipRole, Scope[]> = {
  OWNER: ["members:read", "members:create", "members:delete"],
  ADMIN: ["members:read", "members:create", "members:delete"],
  MEMBER: ["members:read"],
};
