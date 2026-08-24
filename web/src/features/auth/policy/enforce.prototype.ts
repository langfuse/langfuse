/**
 * PROTOTYPE — THROWAWAY, does not merge (branch `prototype/enforcement-seams`,
 * LFE-15038). Shared context helpers for the api adapters: header
 * normalization and the covering-organization lookup.
 */

import {
  type AuthorizationContext,
  type PrincipalOrganization,
} from "./policy.prototype";

/** headerValue normalizes a possibly-repeated header to its first value. */
export const headerValue = (
  value: string | string[] | undefined,
): string | undefined => (Array.isArray(value) ? value[0] : value);

/** coveringOrg returns the principal organization covering the target, when one exists. */
export const coveringOrg = (
  context: AuthorizationContext,
  target: { orgId: string } | { projectId: string },
): PrincipalOrganization | undefined =>
  context.principal.kind === "admin"
    ? undefined
    : context.principal.organizations.find((o) =>
        "orgId" in target
          ? o.orgId === target.orgId
          : o.projectIds.includes(target.projectId),
      );
