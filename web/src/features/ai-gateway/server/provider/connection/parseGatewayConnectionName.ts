import { InvalidRequestError } from "@langfuse/shared";

import { getGatewayConnectionNameError } from "@/src/features/ai-gateway/fns/getGatewayConnectionNameError";

export function parseGatewayConnectionName(rawName: string) {
  const name = rawName.trim();
  const error = getGatewayConnectionNameError(name);
  if (error) throw new InvalidRequestError(error);
  return name;
}
