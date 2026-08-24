/**
 * PROTOTYPE — THROWAWAY, does not merge (branch `prototype/enforcement-seams`,
 * LFE-15038). The PIP: authenticate resolves the request's credential into an
 * AuthorizationContext. Stubbed on this branch.
 */

import { type IncomingHttpHeaders } from "http";

import { UnauthorizedError } from "@langfuse/shared";
import {
  type AuthorizationContext,
  type ErrorResult,
  type Success,
} from "./policy.prototype";

/** authenticate stands in for ApiAuthService.auth() — the independent new path (Verifier, LFE-15032 → Resolver, LFE-15458): a bad credential comes back as an ErrorResult, never a throw; mock it in tests. */
export async function authenticate(
  headers: IncomingHttpHeaders,
): Promise<Authenticated | ErrorResult<UnauthorizedError>> {
  void headers;
  return {
    success: false,
    error: new UnauthorizedError(
      "PROTOTYPE(LFE-15038): ApiAuthService.auth() = Verifier (LFE-15032) → Resolver (LFE-15458); not built on this branch",
    ),
  };
}

/** Authenticated is the verifier's success outcome: the resolved authorization context. */
type Authenticated = Success & { context: AuthorizationContext };
