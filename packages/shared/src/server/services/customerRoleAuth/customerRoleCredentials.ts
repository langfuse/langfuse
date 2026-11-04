import { randomBytes } from "crypto";
import { fromTemporaryCredentials } from "@aws-sdk/credential-providers";

import { getArnPartition } from "../../../domain/storage-role-auth";
import { env } from "../../../env";
import { InvalidRequestError } from "../../../errors/InvalidRequestError";

type TemporaryCredentials = Awaited<
  ReturnType<ReturnType<typeof fromTemporaryCredentials>>
>;

// Role chaining caps sessions at one hour.
const SESSION_DURATION_SECONDS = 3600;
const REFRESH_MARGIN_MS = 10 * 60 * 1000;
const MAX_CACHED_SESSIONS = 10_000;
const FAILURE_BACKOFF_MS = 30 * 1000;

export function getStorageAccessRoleArn() {
  return env.LANGFUSE_CUSTOMER_STORAGE_ACCESS_ROLE_ARN || null;
}

// AWS does not allow AssumeRole across partitions (e.g. aws and aws-cn).
export function assertStorageRolePartition(roleArn: string) {
  const accessRoleArn = getStorageAccessRoleArn();
  if (
    accessRoleArn &&
    getArnPartition(roleArn) !== getArnPartition(accessRoleArn)
  ) {
    throw new InvalidRequestError(
      `The role must be in the ${getArnPartition(accessRoleArn)} AWS partition`,
    );
  }
}

export function generateStorageExternalId() {
  return `lf-${randomBytes(16).toString("hex")}`;
}

function needsRefresh(credentials: TemporaryCredentials) {
  return (
    credentials.expiration !== undefined &&
    credentials.expiration.getTime() - Date.now() < REFRESH_MARGIN_MS
  );
}

function isExpired(credentials: TemporaryCredentials) {
  return (
    credentials.expiration !== undefined &&
    credentials.expiration.getTime() <= Date.now()
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
 * still-valid session. Without one, a failure is returned to every caller for
 * FAILURE_BACKOFF_MS so a broken role does not cause an STS call per request.
 */
export function createSessionCache() {
  const entries = new Map<string, CacheEntry>();

  return async (
    key: string,
    version: string,
    assume: () => Promise<TemporaryCredentials>,
  ) => {
    const entry = entries.get(key);
    const current = entry?.version === version ? entry : undefined;
    const valid =
      current?.credentials && !isExpired(current.credentials)
        ? current.credentials
        : undefined;
    if (valid && !needsRefresh(valid)) {
      return valid;
    }
    if (current?.inFlight) {
      return valid ?? current.inFlight;
    }
    if (!valid && current?.failure && Date.now() < current.failure.retryAfter) {
      throw current.failure.error;
    }

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
    // Callers served from the still-valid session do not await the refresh.
    inFlight.catch(() => {});

    entries.delete(key);
    if (entries.size >= MAX_CACHED_SESSIONS) {
      const oldestKey = entries.keys().next().value;
      if (oldestKey !== undefined) entries.delete(oldestKey);
    }
    entries.set(key, { version, credentials: valid, inFlight });
    return valid ?? inFlight;
  };
}

const accessRoleSessions = createSessionCache();
const customerRoleSessions = createSessionCache();

/**
 * Failure to assume Langfuse's own access role. This is a Langfuse
 * infrastructure fault, not a problem with the customer's role or bucket, so
 * the AWS error (which names Langfuse's roles) is not attached.
 */
export class StorageAccessRoleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageAccessRoleError";
  }
}

function getAccessRoleCredentials() {
  const accessRoleArn = getStorageAccessRoleArn();
  if (!accessRoleArn) {
    throw new StorageAccessRoleError(
      "IAM role auth is not available: LANGFUSE_CUSTOMER_STORAGE_ACCESS_ROLE_ARN is not set",
    );
  }
  return accessRoleSessions(accessRoleArn, "", () =>
    fromTemporaryCredentials({
      params: {
        RoleArn: accessRoleArn,
        RoleSessionName: "langfuse-customer-storage",
        DurationSeconds: SESSION_DURATION_SECONDS,
      },
    })(),
  ).catch((error: unknown) => {
    const reason = error instanceof Error ? error.name : "UnknownError";
    throw new StorageAccessRoleError(
      `Langfuse could not assume its storage access role (${reason})`,
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
 * Credentials provider for a customer role, assumed through the Langfuse
 * access role with the integration's external ID, session tags and an inline
 * session policy. Every new session first checks that the role's trust policy
 * requires the external ID. Never falls back to the default credential chain.
 */
export function getStorageRoleCredentialsProvider({
  cacheKey,
  version,
  roleArn,
  externalId,
  projectId,
  orgId,
  sessionPolicy,
}: {
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
      await verifyStorageRoleRequiresExternalId(
        params(generateStorageExternalId()),
      );
      return fromTemporaryCredentials({
        masterCredentials: getAccessRoleCredentials,
        params: params(externalId),
      })();
    });
}

function isAccessDeniedError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "AccessDenied" || error.name === "AccessDeniedException")
  );
}

type AssumeRoleParams = Parameters<
  typeof fromTemporaryCredentials
>[0]["params"];

/**
 * Assumes the customer role with a random wrong external ID and otherwise the
 * same parameters as the real session, so a trust policy that only rejects on
 * other conditions (e.g. a missing session tag) is not mistaken for one that
 * requires the external ID. The trust policy must reject it; if AWS grants the
 * session, the role is open to any caller that can reach the Langfuse access
 * role (confused deputy).
 */
async function verifyStorageRoleRequiresExternalId(params: AssumeRoleParams) {
  const accessRoleCredentials = await getAccessRoleCredentials();

  try {
    await fromTemporaryCredentials({
      masterCredentials: accessRoleCredentials,
      params,
    })();
  } catch (error) {
    if (isAccessDeniedError(error)) return;
    throw error;
  }

  throw new InvalidRequestError(
    "The role's trust policy does not require the external ID. Add the sts:ExternalId condition shown in the setup instructions.",
  );
}
