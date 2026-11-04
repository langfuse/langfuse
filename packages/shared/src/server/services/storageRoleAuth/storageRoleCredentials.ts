import { randomBytes } from "crypto";
import { fromTemporaryCredentials } from "@aws-sdk/credential-providers";

import { env } from "../../../env";
import { InvalidRequestError } from "../../../errors/InvalidRequestError";

type TemporaryCredentials = Awaited<
  ReturnType<ReturnType<typeof fromTemporaryCredentials>>
>;

// Role chaining caps sessions at one hour.
const SESSION_DURATION_SECONDS = 3600;
const REFRESH_MARGIN_MS = 10 * 60 * 1000;
const MAX_CACHED_SESSIONS = 10_000;

export function getStorageAccessRoleArn() {
  return env.LANGFUSE_CUSTOMER_STORAGE_ACCESS_ROLE_ARN || null;
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

type CacheEntry = {
  version: string;
  credentials?: TemporaryCredentials;
  inFlight?: Promise<TemporaryCredentials>;
};

/**
 * Caches one session per key. Concurrent callers share the in-flight request,
 * failures are not cached, and a new version (e.g. the integration's
 * updatedAt) discards the old session.
 */
function createSessionCache() {
  const entries = new Map<string, CacheEntry>();

  return async (
    key: string,
    version: string,
    assume: () => Promise<TemporaryCredentials>,
  ) => {
    const entry = entries.get(key);
    const current = entry?.version === version ? entry : undefined;
    if (current?.credentials && !needsRefresh(current.credentials)) {
      return current.credentials;
    }
    if (current?.inFlight) {
      return current.inFlight;
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
          entries.delete(key);
        }
        throw error;
      },
    );

    entries.delete(key);
    if (entries.size >= MAX_CACHED_SESSIONS) {
      const oldestKey = entries.keys().next().value;
      if (oldestKey !== undefined) entries.delete(oldestKey);
    }
    entries.set(key, {
      version,
      credentials: current?.credentials,
      inFlight,
    });
    return inFlight;
  };
}

const accessRoleSessions = createSessionCache();
const customerRoleSessions = createSessionCache();

function getAccessRoleCredentials() {
  const accessRoleArn = getStorageAccessRoleArn();
  if (!accessRoleArn) {
    throw new Error(
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
  );
}

function sessionName(projectId: string) {
  return `langfuse-${projectId}`.slice(0, 64);
}

/**
 * Credentials provider for a customer role, assumed through the Langfuse
 * access role with the integration's external ID, session tags and an inline
 * session policy. Never falls back to the default credential chain.
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
  return () =>
    customerRoleSessions(cacheKey, version, () =>
      fromTemporaryCredentials({
        masterCredentials: getAccessRoleCredentials,
        params: {
          RoleArn: roleArn,
          ExternalId: externalId,
          RoleSessionName: sessionName(projectId),
          SourceIdentity: sessionName(projectId),
          DurationSeconds: SESSION_DURATION_SECONDS,
          Policy: sessionPolicy,
          Tags: [
            { Key: "langfuse-project-id", Value: projectId },
            { Key: "langfuse-org-id", Value: orgId },
          ],
        },
      })(),
    );
}

function isAccessDeniedError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "AccessDenied" || error.name === "AccessDeniedException")
  );
}

/**
 * Assumes the customer role with a random wrong external ID. The trust policy
 * must reject it; if AWS grants the session, the role is open to any caller
 * that can reach the Langfuse access role (confused deputy).
 */
export async function verifyStorageRoleRequiresExternalId({
  roleArn,
  projectId,
}: {
  roleArn: string;
  projectId: string;
}) {
  const accessRoleCredentials = await getAccessRoleCredentials();

  try {
    await fromTemporaryCredentials({
      masterCredentials: accessRoleCredentials,
      params: {
        RoleArn: roleArn,
        ExternalId: generateStorageExternalId(),
        RoleSessionName: sessionName(projectId),
        DurationSeconds: 900,
      },
    })();
  } catch (error) {
    if (isAccessDeniedError(error)) return;
    throw error;
  }

  throw new InvalidRequestError(
    "The role's trust policy does not require the external ID. Add the sts:ExternalId condition shown in the setup instructions.",
  );
}
