import type { Role } from "@langfuse/shared/src/db";

export type GatewayAuditActor = {
  userId: string;
  orgRole: Role;
};
