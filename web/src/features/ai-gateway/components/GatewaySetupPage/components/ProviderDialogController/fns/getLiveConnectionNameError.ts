import { GATEWAY_CONNECTION_NAME_ERRORS } from "@/src/features/ai-gateway/constants/gatewayConnection";
import { getGatewayConnectionNameError } from "@/src/features/ai-gateway/fns/getGatewayConnectionNameError";

/**
 * Mirrors the server checks while typing. An empty field stays quiet (saving is
 * disabled) and an unchanged name passes, matching the server's legacy-name rule.
 */
export function getLiveConnectionNameError(params: {
  name: string;
  currentName: string | undefined;
  existingNames: readonly string[];
}) {
  const name = params.name.trim();
  if (!name || name === params.currentName) return null;
  const formatError = getGatewayConnectionNameError(name);
  if (formatError) return formatError;
  const lowerName = name.toLowerCase();
  const isTaken = params.existingNames.some(
    (existing) =>
      existing !== params.currentName && existing.toLowerCase() === lowerName,
  );
  return isTaken ? GATEWAY_CONNECTION_NAME_ERRORS.duplicate : null;
}
