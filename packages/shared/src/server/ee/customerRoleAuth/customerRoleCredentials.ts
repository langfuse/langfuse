import { randomBytes } from "crypto";
import { fromTemporaryCredentials } from "@aws-sdk/credential-providers";

import { InvalidRequestError } from "../../../errors/InvalidRequestError";

type TemporaryCredentials = Awaited<
  ReturnType<ReturnType<typeof fromTemporaryCredentials>>
>;

// Role chaining caps sessions at one hour.
const SESSION_DURATION_SECONDS = 3600;
export const REFRESH_MARGIN_MS = 10 * 60 * 1000;
const MAX_CACHED_SESSIONS = 10_000;
export const FAILURE_BACKOFF_MS = 30 * 1000;
// Callers presign URLs that live up to 5 minutes, so a session must outlive
// them. A session closer to expiry than this is not served, even while its
// refresh is pending or backing off.
export const MIN_REMAINING_MS = 6 * 60 * 1000;

// A stalled STS call would otherwise hold the shared in-flight refresh forever.
const STS_CLIENT_CONFIG = {
  requestHandler: {
    connectionTimeout: 3_000,
    requestTimeout: 10_000,
    throwOnRequestTimeout: true,
  },
};

export function generateCustomerRoleExternalId() {
  return `lf-${randomBytes(16).toString("hex")}`;
}

function needsRefresh(credentials: TemporaryCredentials) {
  return (
    credentials.expiration !== undefined &&
    credentials.expiration.getTime() - Date.now() < REFRESH_MARGIN_MS
  );
}

function isTooCloseToExpiry(credentials: TemporaryCredentials) {
  return (
    credentials.expiration !== undefined &&
    credentials.expiration.getTime() - Date.now() < MIN_REMAINING_MS
  );
}

type CacheEntry = {
  version: string;
  credentials?: TemporaryCredentials;
  inFlight?: Promise<TemporaryCredentials>;
  failure?: { error: unknown; retryAfter: number };
};

/**
 * Caches one session per key. Concurrent callers share the in-flight request,
 * and a new version (e.g. the integration's updatedAt) discards the old
 * session. While a refresh is pending or after it fails, callers keep the
 * previous session if it has at least MIN_REMAINING_MS left. After a failure,
 * no new refresh starts for FAILURE_BACKOFF_MS: callers keep that session or,
 * without one, get the failure, so a broken role does not cause an STS call
 * per request.
 */
export function createSessionCache() {
  const entries = new Map<string, CacheEntry>();

  const startRefresh = ({
    key,
    version,
    valid,
    assume,
  }: {
    key: string;
    version: string;
    valid: TemporaryCredentials | undefined;
    assume: () => Promise<TemporaryCredentials>;
  }) => {
    const inFlight = assume().then(
      (credentials) => {
        if (entries.get(key)?.inFlight === inFlight) {
          entries.set(key, { version, credentials });
        }
        return credentials;
      },
      (error: unknown) => {
        if (entries.get(key)?.inFlight === inFlight) {
          entries.set(key, {
            version,
            credentials: valid,
            failure: { error, retryAfter: Date.now() + FAILURE_BACKOFF_MS },
          });
        }
        throw error;
      },
    );
    // Callers served from the previous session do not await the refresh.
    inFlight.catch(() => {});
    return inFlight;
  };

  const store = (key: string, entry: CacheEntry) => {
    entries.delete(key);
    if (entries.size >= MAX_CACHED_SESSIONS) {
      const oldestKey = entries.keys().next().value;
      if (oldestKey !== undefined) entries.delete(oldestKey);
    }
    entries.set(key, entry);
  };

  return async (
    key: string,
    version: string,
    assume: () => Promise<TemporaryCredentials>,
  ) => {
    const entry = entries.get(key);
    const current = entry?.version === version ? entry : undefined;
    const valid = getValidCredentials(current);

    if (valid && !needsRefresh(valid)) return valid;
    if (current?.inFlight) return valid ?? current.inFlight;
    if (isBackingOff(current)) {
      if (valid) return valid;
      throw current?.failure?.error;
    }

    const inFlight = startRefresh({ key, version, valid, assume });
    store(key, { version, credentials: valid, inFlight });
    return valid ?? inFlight;
  };
}

function getValidCredentials(entry: CacheEntry | undefined) {
  return entry?.credentials && !isTooCloseToExpiry(entry.credentials)
    ? entry.credentials
    : undefined;
}

function isBackingOff(entry: CacheEntry | undefined) {
  return entry?.failure !== undefined && Date.now() < entry.failure.retryAfter;
}

const crossAccountRoleSessions = createSessionCache();
const customerRoleSessions = createSessionCache();

/**
 * Failure to assume Langfuse's own cross-account role, or none is configured. This is
 * a Langfuse infrastructure fault, not a problem with the customer's role, so
 * the AWS error (which names Langfuse's roles) is not attached.
 */
export class CrossAccountRoleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CrossAccountRoleError";
  }
}

function getCrossAccountRoleCredentials(crossAccountRoleArn: string) {
  return crossAccountRoleSessions(crossAccountRoleArn, "", () =>
    fromTemporaryCredentials({
      params: {
        RoleArn: crossAccountRoleArn,
        RoleSessionName: "langfuse-customer-role",
        DurationSeconds: SESSION_DURATION_SECONDS,
      },
      clientConfig: STS_CLIENT_CONFIG,
    })(),
  ).catch((error: unknown) => {
    const reason = error instanceof Error ? error.name : "UnknownError";
    throw new CrossAccountRoleError(
      `Langfuse could not assume its cross-account role (${reason})`,
    );
  });
}

// STS only accepts these characters in session names and source identities.
function sessionName(projectId: string) {
  return `langfuse-${projectId}`.replace(/[^\w+=,.@-]/g, "-").slice(0, 64);
}

function sessionTagValue(value: string) {
  return value.replace(/[^\w+=,.@:/-]/g, "-").slice(0, 256);
}

/**
 * AWS credentials provider for a role in the customer's account, assumed
 * through a Langfuse cross-account role (role chaining) with the integration's
 * external ID, session tags and an inline session policy that narrows what the
 * session may do. Every new session first checks that the role's trust policy
 * requires the external ID. Never falls back to the default credential chain.
 */
export function getCustomerRoleCredentialsProvider({
  crossAccountRoleArn,
  cacheKey,
  version,
  roleArn,
  externalId,
  projectId,
  orgId,
  sessionPolicy,
}: {
  crossAccountRoleArn: string;
  cacheKey: string;
  version: string;
  roleArn: string;
  externalId: string;
  projectId: string;
  orgId: string;
  sessionPolicy: string;
}) {
  const params = (externalId: string) => ({
    RoleArn: roleArn,
    ExternalId: externalId,
    RoleSessionName: sessionName(projectId),
    SourceIdentity: sessionName(projectId),
    DurationSeconds: SESSION_DURATION_SECONDS,
    Policy: sessionPolicy,
    Tags: [
      { Key: "langfuse-project-id", Value: sessionTagValue(projectId) },
      { Key: "langfuse-org-id", Value: sessionTagValue(orgId) },
    ],
  });

  return () =>
    customerRoleSessions(cacheKey, version, async () => {
      await verifyRoleRequiresExternalId(
        crossAccountRoleArn,
        params(generateCustomerRoleExternalId()),
      );
      return fromTemporaryCredentials({
        masterCredentials: () =>
          getCrossAccountRoleCredentials(crossAccountRoleArn),
        params: params(externalId),
        clientConfig: STS_CLIENT_CONFIG,
      })().catch((error: unknown) => {
        throw toCustomerRoleAssumeError(error);
      });
    });
}

function isAccessDeniedError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    (error.name === "AccessDenied" || error.name === "AccessDeniedException")
  );
}

// AWS names the policy type behind a denial. These policies sit on Langfuse's
// side of the role chain; a denial by the customer's trust policy names none.
const LANGFUSE_SIDE_DENIAL_REGEX =
  /identity-based policy|service control policy|permissions boundary/i;

/**
 * Maps a failure to assume the customer role to a `CrossAccountRoleError` when
 * Langfuse's cross-account role lacks the permission, so it is not reported
 * as a fault in the customer's role.
 */
export function toCustomerRoleAssumeError(error: unknown): unknown {
  if (
    isAccessDeniedError(error) &&
    LANGFUSE_SIDE_DENIAL_REGEX.test(error.message)
  ) {
    return new CrossAccountRoleError(
      "Langfuse's cross-account role is not allowed to assume customer roles (AccessDenied)",
    );
  }
  return error;
}

type AssumeRoleParams = Parameters<
  typeof fromTemporaryCredentials
>[0]["params"];

/**
 * Assumes the customer role with a random wrong external ID and otherwise the
 * same parameters as the real session, so a trust policy that only rejects on
 * other conditions (e.g. a missing session tag) is not mistaken for one that
 * requires the external ID. The trust policy must reject it; if AWS grants the
 * session, the role is open to any caller that can reach the Langfuse
 * cross-account role (confused deputy).
 */
async function verifyRoleRequiresExternalId(
  crossAccountRoleArn: string,
  params: AssumeRoleParams,
) {
  const crossAccountRoleCredentials =
    await getCrossAccountRoleCredentials(crossAccountRoleArn);

  try {
    await fromTemporaryCredentials({
      masterCredentials: crossAccountRoleCredentials,
      params,
      clientConfig: STS_CLIENT_CONFIG,
    })();
  } catch (error) {
    const mapped = toCustomerRoleAssumeError(error);
    if (mapped === error && isAccessDeniedError(error)) return;
    throw mapped;
  }

  throw new InvalidRequestError(
    "The role's trust policy does not require the external ID. Add the sts:ExternalId condition shown in the setup instructions.",
  );
}
