import { createHash } from "node:crypto";

import { GoogleAuth, JWT, gaxios } from "google-auth-library";

const VERTEX_AI_AUTH_SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
];
const MAX_CACHED_SERVICE_ACCOUNT_CLIENTS = 1_000;

let googleAuth: GoogleAuth | undefined;
let projectIdPromise: Promise<string> | undefined;
const serviceAccountClients = new Map<string, JWT>();

/** A failed token exchange; `status` is Google's HTTP status, or null when Google was not reached. */
export class VertexTokenExchangeError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "VertexTokenExchangeError";
  }
}

function getVertexGoogleAuth(): GoogleAuth {
  if (!googleAuth) {
    googleAuth = new GoogleAuth({ scopes: VERTEX_AI_AUTH_SCOPES });
  }
  return googleAuth;
}

/**
 * GCP project for Vertex requests that authenticate through application
 * default credentials.
 *
 * The AI SDK requires an explicit project for URL construction (it does not ask
 * the auth library), so callers that have no service account key resolve it
 * here instead.
 *
 * The answer is a property of the deployment's own credentials and cannot
 * change while the process runs, so it is resolved once. Without that, every
 * model build repeats the lookup, which falls through to the GCE metadata
 * server on Cloud Run and GKE — a round trip on each Assistant run, Ask AI
 * request and search-bar query. A rejection is not kept, so a transient
 * metadata failure does not poison the process.
 *
 * This lives apart from `vertex.ts` so the worker can reach it without a direct
 * dependency on google-auth-library, which pnpm's strict layout does not expose
 * to that package. Pass `generateVertexAccessTokenFromADC` into the Vertex
 * Anthropic factory for the same reason: otherwise the worker's nested SDK
 * copy constructs GoogleAuth itself.
 */
export async function resolveVertexProjectIdFromADC(): Promise<string> {
  if (!projectIdPromise) {
    projectIdPromise = getVertexGoogleAuth()
      .getProjectId()
      .catch((error: unknown) => {
        projectIdPromise = undefined;
        throw error;
      });
  }

  return projectIdPromise;
}

/**
 * OAuth access token from the same ADC chain as
 * `resolveVertexProjectIdFromADC`.
 *
 * Tokens expire, so they are fetched per call. The GoogleAuth client is reused.
 */
export async function generateVertexAccessTokenFromADC(): Promise<
  string | null
> {
  const client = await getVertexGoogleAuth().getClient();
  const token = await client.getAccessToken();
  return token?.token ?? null;
}

/**
 * OAuth access token for a service account key. One client is kept per key,
 * so a token is reused until shortly before it expires and concurrent
 * requests share one refresh.
 */
export async function generateVertexAccessTokenForServiceAccount(key: {
  client_email: string;
  private_key: string;
}): Promise<string> {
  let token: string | null | undefined;
  try {
    ({ token } = await getServiceAccountClient(key).getAccessToken());
  } catch (error) {
    if (error instanceof gaxios.GaxiosError) {
      throw new VertexTokenExchangeError(
        error.message,
        error.response?.status ?? null,
      );
    }
    throw error;
  }
  if (!token) throw new Error("Google returned no access token");
  return token;
}

function getServiceAccountClient(key: {
  client_email: string;
  private_key: string;
}) {
  const cacheKey = createHash("sha256")
    .update(key.client_email)
    .update("\0")
    .update(key.private_key)
    .digest("hex");
  const cached = serviceAccountClients.get(cacheKey);
  if (cached) return cached;

  // Built from the email and private key only, so a key's `token_uri` and
  // `universe_domain` cannot redirect the token exchange.
  const client = new JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: VERTEX_AI_AUTH_SCOPES,
  });
  if (serviceAccountClients.size >= MAX_CACHED_SERVICE_ACCOUNT_CLIENTS) {
    const oldest = serviceAccountClients.keys().next().value;
    if (oldest !== undefined) serviceAccountClients.delete(oldest);
  }
  serviceAccountClients.set(cacheKey, client);
  return client;
}
