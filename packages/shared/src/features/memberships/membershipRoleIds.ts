import { Role } from "@prisma/client";

import { SystemRoleId } from "../rbac/types";

/** membershipRoleIds are the system roles that memberships mirror into role assignments */
export const membershipRoleIds = Object.values(Role).map(SystemRoleId);
