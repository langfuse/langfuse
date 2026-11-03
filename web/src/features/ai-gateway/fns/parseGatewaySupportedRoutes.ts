import { z } from "zod/v4";

const gatewaySupportedRoutesSchema = z.array(
  z.enum(["openai.responses", "openai.chat-completions", "anthropic.messages"]),
);

/** Routes the probe found on a custom origin; `null` if never probed. */
export function parseGatewaySupportedRoutes(value: unknown) {
  return gatewaySupportedRoutesSchema.nullable().parse(value);
}
