import type { Prisma } from "@langfuse/shared/src/db";

import {
  GATEWAY_KEY_ROLES,
  SEPARATE_GATEWAY_API_KEYS,
} from "@/src/features/ai-gateway/fns/separateGatewayApiKeys";

/** excludeGatewayApiKeys filters gateway-role keys out of the organization API key settings list. */
export const excludeGatewayApiKeys: Prisma.ApiKeyWhereInput =
  SEPARATE_GATEWAY_API_KEYS
    ? { roleAssignments: { none: { systemRole: { in: GATEWAY_KEY_ROLES } } } }
    : {};
