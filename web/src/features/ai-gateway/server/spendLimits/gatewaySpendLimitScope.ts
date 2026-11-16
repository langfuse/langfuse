import { z } from "zod/v4";

import type { GatewaySpendLimitRecord } from "./gatewaySpendLimitRepository";

/** What a spend limit caps, with the subject it applies to. One variant per `GatewaySpendLimitScope`. */
export const GatewaySpendLimitScopeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("API_KEY"), apiKeyId: z.string() }),
]);
export type GatewaySpendLimitScope = z.infer<
  typeof GatewaySpendLimitScopeSchema
>;

/** The limit's columns for a scope: the scope and its subject column. */
export function toScopeColumns(scope: GatewaySpendLimitScope) {
  switch (scope.type) {
    case "API_KEY":
      return { scope: scope.type, apiKeyId: scope.apiKeyId };
  }
}

export function toGatewaySpendLimitScope(
  limit: Pick<GatewaySpendLimitRecord, "scope" | "apiKeyId">,
) {
  switch (limit.scope) {
    case "API_KEY":
      // The database requires the API key for this scope.
      return { type: "API_KEY" as const, apiKeyId: limit.apiKeyId! };
  }
}
