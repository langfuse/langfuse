import { type Prisma, type SystemRole } from "@langfuse/shared/src/db";

/**
 * Gateway keys are created and listed only on the AI Gateway settings page.
 * Set to false to offer and list them in organization API keys again. The
 * public API still accepts and returns them either way.
 */
const SEPARATE_GATEWAY_API_KEYS = true;

const GATEWAY_ROLE: SystemRole = "AI_GATEWAY";

/** withoutGatewayRole drops the gateway role from the roles offered when creating an organization API key. */
export function withoutGatewayRole(roles: SystemRole[]): SystemRole[] {
  if (!SEPARATE_GATEWAY_API_KEYS) return roles;
  return roles.filter((role) => role !== GATEWAY_ROLE);
}

/** excludeGatewayApiKeys filters gateway-role keys out of the organization API key settings list. */
export const excludeGatewayApiKeys: Prisma.ApiKeyWhereInput =
  SEPARATE_GATEWAY_API_KEYS
    ? { roleAssignments: { none: { systemRole: GATEWAY_ROLE } } }
    : {};
