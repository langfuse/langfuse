import { type IncomingHttpHeaders } from "http";

import {
  type BaseError,
  type InternalServerError,
  UnauthorizedError,
} from "@langfuse/shared";

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
      return errorResult(new UnauthorizedError(invalidCredentials));
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
): ErrorResult<UnauthorizedError> | null {
  if (principal.kind === "admin" && !params.isAdminApiKeyAuthAllowed) {
    return errorResult(
      new UnauthorizedError("Admin API key auth is not allowed here"),
    );
  }
  if (
    principal.kind === "apiKey" &&
    principal.isInAppAgentKey &&
    !params.allowInAppAgentKey
  ) {
    return errorResult(
      new UnauthorizedError(
        "Access denied - in-app agent keys are not allowed for this endpoint",
      ),
    );
  }
  return null;
}

/** errorResult wraps a BaseError subclass into a typed ErrorResult. */
const errorResult = <E extends BaseError>(e: E): ErrorResult<E> => ({
  success: false,
  error: e,
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
  | ErrorResult<UnauthorizedError | InternalServerError>;

/** Authenticated is the pipeline's success outcome: the resolved authorization context. */
export type Authenticated = Success & { context: AuthorizationContext };
