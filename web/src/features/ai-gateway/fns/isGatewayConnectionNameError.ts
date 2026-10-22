import { GATEWAY_CONNECTION_NAME_ERRORS } from "@/src/features/ai-gateway/constants/gatewayConnection";

const connectionNameErrorMessages = new Set<string>(
  Object.values(GATEWAY_CONNECTION_NAME_ERRORS),
);

export function isGatewayConnectionNameError(message: string) {
  return connectionNameErrorMessages.has(message);
}
