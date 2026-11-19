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

/** The scope capping one key or user, by its id. */
export function toSpendLimitScope(
  type: GatewaySpendLimitScope["type"],
  subjectId: string,
): GatewaySpendLimitScope {
  switch (type) {
    case "API_KEY":
      return { type, apiKeyId: subjectId };
    case "USER":
      return { type, userId: subjectId };
  }
}
