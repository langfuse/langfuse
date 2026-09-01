import { type IncomingHttpHeaders } from "http";

import { type InternalServerError, UnauthorizedError } from "@langfuse/shared";

import { ContextResolver } from "@/src/features/auth/policy/contextResolver";
import {
  parseAuthorizationHeader,
  type Credential,
} from "@/src/features/apiKey/helpers/parseAuthorizationHeader";
import { AuthenticatorCache } from "@/src/features/apiKey/authenticatorCache";
import { Verifier, invalidCredentials } from "@/src/features/apiKey/verifier";
import {
  type AuthorizationContext,
  type ErrorResult,
  type Principal,
  type Success,
} from "@/src/features/auth/policy/types";

/** Authenticator resolves a request's credential into an `AuthorizationContext`: cache → verify → resolve → gate key kind. */
export class Authenticator {
  constructor(
    private readonly authn: Verifier = new Verifier(),
    private readonly authz: ContextResolver = new ContextResolver(),
    private readonly cache: AuthenticatorCache = new AuthenticatorCache(),
  ) {}

  /** auth runs the full pipeline read-through the context cache and gates the resolved principal on every path, returning a typed failure rather than throwing. */
  async auth(params: ApiKeyAuthParams): Promise<ApiKeyAuthResults> {
    const credential = parseAuthorizationHeader(params.headers.authorization);
    if (credential.kind === "malformed") {
      return {
        success: false,
        error: new UnauthorizedError(invalidCredentials),
      };
    }

    const result =
      (await this.cache.get(credential)) ??
      (await this.verifyAndResolve(credential));
    if (result.success) {
      const denied = gate(result.context.principal, params);
      if (denied) return denied;
    }
    return result;
  }

  /** verifyAndResolve authenticates and materializes on a cache miss, writing every cacheable outcome back to the cache. */
  private async verifyAndResolve(
    credential: Credential,
  ): Promise<ApiKeyAuthResults> {
    const verified = await this.authn.verify(credential);
    if (!verified.success) {
      await this.cache.set(credential, verified);
      return verified;
    }
    const resolved = await this.authz.resolve(verified);
    await this.cache.set(credential, resolved);
    return resolved;
  }
}

/** authenticator is the Authenticator on its default prisma/redis collaborators. */
export const authenticator = new Authenticator();

/** gate rejects key kinds a route does not opt into — in-app-agent and admin — reading the resolved principal so it reruns on every cache path. */
function gate(
  principal: Principal,
  params: ApiKeyAuthParams,
): ErrorResult<UnauthorizedError> | null {
  if (principal.kind === "admin" && !params.isAdminApiKeyAuthAllowed) {
    return {
      success: false,
      error: new UnauthorizedError("Admin API key auth is not allowed here"),
    };
  }
  if (
    principal.kind === "apiKey" &&
    principal.isInAppAgentKey &&
    !params.allowInAppAgentKey
  ) {
    return {
      success: false,
      error: new UnauthorizedError(
        "Access denied - in-app agent keys are not allowed for this endpoint",
      ),
    };
  }
  return null;
}

/** ApiKeyAuthParams is the request headers plus the route's key-kind opt-ins. */
export type ApiKeyAuthParams = {
  headers: IncomingHttpHeaders;
  allowInAppAgentKey?: boolean;
  isAdminApiKeyAuthAllowed?: boolean;
};

/** ApiKeyAuthResults is the pipeline's outcome: the resolved context, or a typed failure. */
export type ApiKeyAuthResults =
  | Authenticated
  | ErrorResult<UnauthorizedError | InternalServerError>;

/** Authenticated is the pipeline's success outcome: the resolved authorization context. */
export type Authenticated = Success & { context: AuthorizationContext };
