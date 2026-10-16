import { type SystemRole } from "@langfuse/shared/src/db";

/**
 * Gateway keys are created and listed only on the AI Gateway settings page.
 * Set to false to offer and list them in organization API keys again. The
 * API still accepts and returns them either way.
 */
const SEPARATE_GATEWAY_API_KEYS = true;

const GATEWAY_ROLE: SystemRole = "AI_GATEWAY";

/** withoutGatewayRole drops the gateway role from the roles offered when creating an organization API key. */
export function withoutGatewayRole(roles: SystemRole[]): SystemRole[] {
  if (!SEPARATE_GATEWAY_API_KEYS) return roles;
  return roles.filter((role) => role !== GATEWAY_ROLE);
}

/** withoutGatewayApiKeys drops keys holding the gateway role from an organization API key list. */
export function withoutGatewayApiKeys<
  T extends { roleAssignments: { systemRole: SystemRole }[] },
>(apiKeys: T[]): T[] {
  if (!SEPARATE_GATEWAY_API_KEYS) return apiKeys;
  return apiKeys.filter(
    (apiKey) =>
      !apiKey.roleAssignments.some(
        (assignment) => assignment.systemRole === GATEWAY_ROLE,
      ),
  );
}
