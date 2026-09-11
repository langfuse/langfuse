import { type IncomingHttpHeaders } from "http";

import {
  ForbiddenError,
  type InternalServerError,
  UnauthorizedError,
} from "@langfuse/shared";

import { env } from "@/src/env.mjs";
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

/** Authenticator resolves a request's credential into an `AuthorizationContext`: cache → verify → resolve → enforce route settings. */
export class Authenticator {
  constructor(
    private readonly authn: Verifier = new Verifier(),
    private readonly authz: ContextResolver = new ContextResolver(),
    private readonly cache: AuthenticatorCache = new AuthenticatorCache(),
  ) {}

  /** authenticate runs the full pipeline read-through the context cache and enforces route settings on the resolved principal on every path, returning a typed failure rather than throwing. */
  async authenticate(params: ApiKeyAuthParams): Promise<ApiKeyAuthResults> {
    const credential = parseAuthorizationHeader(params.headers.authorization);
    if (credential.kind === "malformed") {
      return unauthorized(invalidCredentials);
    }

    let authResult = await this.cache.get(credential);
    if (!authResult) {
      authResult = await this.verifyAndResolve(credential);
    }

    if (authResult.success) {
      const denied = enforceRouteSettings(authResult.context.principal, params);
      if (denied) {
        return denied;
      }
    }

    return authResult;
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

/** enforceRouteSettings rejects key kinds a route does not opt into — in-app-agent and admin — reading the resolved principal so it reruns on every cache path. */
function enforceRouteSettings(
  principal: Principal,
  params: ApiKeyAuthParams,
): ErrorResult<UnauthorizedError | ForbiddenError> | null {
  if (principal.kind === "admin") {
    if (!params.isAdminApiKeyAuthAllowed) {
      return unauthorized("Admin API key auth is not allowed here");
    }
    if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
      return forbidden("Admin API key auth is not available on Langfuse Cloud");
    }
  }
  if (
    principal.kind === "apiKey" &&
    principal.isInAppAgentKey &&
    !params.allowInAppAgentKey
  ) {
    return unauthorized(
      "Access denied - in-app agent keys are not allowed for this endpoint",
    );
  }
  return null;
}

/** unauthorized is a 401 ErrorResult carrying an optional message. */
const unauthorized = (message?: string): ErrorResult<UnauthorizedError> => ({
  success: false,
  error: new UnauthorizedError(message),
});

/** forbidden is a 403 ErrorResult carrying an optional message. */
const forbidden = (message?: string): ErrorResult<ForbiddenError> => ({
  success: false,
  error: new ForbiddenError(message),
});

/** ApiKeyAuthParams is the request headers plus the route's key-kind opt-ins. */
export type ApiKeyAuthParams = {
  headers: IncomingHttpHeaders;
  allowInAppAgentKey?: boolean;
  isAdminApiKeyAuthAllowed?: boolean;
};

/** ApiKeyAuthResults is the pipeline's outcome: the resolved context, or a typed failure. */
export type ApiKeyAuthResults =
  | Authenticated
  | ErrorResult<UnauthorizedError | ForbiddenError | InternalServerError>;

/** Authenticated is the pipeline's success outcome: the resolved authorization context. */
export type Authenticated = Success & { context: AuthorizationContext };
