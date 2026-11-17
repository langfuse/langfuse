/** What a spend limit caps, with the subject it applies to. One variant per `GatewaySpendLimitScope`. */
export type GatewaySpendLimitScope =
  | { type: "API_KEY"; apiKeyId: string }
  | { type: "USER"; userId: string };

/** The limit's columns for a scope: the scope and its subject column. */
export function toScopeColumns(scope: GatewaySpendLimitScope) {
  switch (scope.type) {
    case "API_KEY":
      return { scope: scope.type, apiKeyId: scope.apiKeyId };
    case "USER":
      return { scope: scope.type, userId: scope.userId };
  }
}
