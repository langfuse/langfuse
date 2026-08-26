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

/** authenticate stands in for ApiAuthService.auth() — the independent new path (Verifier, LFE-15032 → Resolver, LFE-15458): a bad credential comes back as an ErrorResult, never a throw; mock it in tests. The route-level key-kind gates ride in as params (stubbed). */
export async function authenticate(params: {
  headers: IncomingHttpHeaders;
  allowInAppAgentKey?: boolean;
  isAdminApiKeyAuthAllowed?: boolean;
}): Promise<Authenticated | ErrorResult<UnauthorizedError>> {
  // STUB (LFE-15559): the route-level key-kind gates land here, where legacy's
  // verifyAuthHeaderAndReturnScope enforces them — an in-app-agent key needs
  // allowInAppAgentKey, an admin key needs isAdminApiKeyAuthAllowed. Not built,
  // so a non-allowlisted route still admits both kinds (a known new_allows
  // divergence in shadow until the Verifier surfaces the key kind).
  void params;
  return {
    success: false,
    error: new UnauthorizedError(
      "PROTOTYPE(LFE-15038): ApiAuthService.auth() = Verifier (LFE-15032) → Resolver (LFE-15458); not built on this branch",
    ),
  };
}

/** Authenticated is the verifier's success outcome: the resolved authorization context. */
type Authenticated = Success & { context: AuthorizationContext };
