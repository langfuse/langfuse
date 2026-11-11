import { createHash } from "node:crypto";

import { GCPServiceAccountKeySchema } from "@langfuse/shared";
import { JWT } from "google-auth-library";
import { z } from "zod/v4";

// Kept in sync with the gateway's base URL check: the location becomes a DNS
// label of a fixed Google host and the project a path segment, so neither may
// change the host or the path.
const VERTEX_SEGMENT_PATTERN = /^[a-z0-9-]+$/;

export const GatewayVertexConfigSchema = z
  .object({ location: z.string().regex(VERTEX_SEGMENT_PATTERN) })
  .strict();
export type GatewayVertexConfig = z.infer<typeof GatewayVertexConfigSchema>;

const CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const MAX_CACHED_CLIENTS = 1_000;

/** Throws unless the credential is a service account key for a project the gateway can address. */
export function parseVertexServiceAccountKey(credential: string) {
  const key = GCPServiceAccountKeySchema.parse(JSON.parse(credential));
  if (!VERTEX_SEGMENT_PATTERN.test(key.project_id)) {
    throw new Error("Unsupported Google Cloud project ID");
  }
  return key;
}

function vertexOrigin(config: GatewayVertexConfig) {
  return config.location === "global"
    ? "https://aiplatform.googleapis.com"
    : `https://${config.location}-aiplatform.googleapis.com`;
}

export function vertexOpenAICompatibleBaseUrl(params: {
  config: GatewayVertexConfig;
  credential: string;
}) {
  const { project_id } = parseVertexServiceAccountKey(params.credential);
  return `${vertexOrigin(params.config)}/v1/projects/${project_id}/locations/${params.config.location}/endpoints/openapi`;
}

export function vertexPublisherModelsUrl(config: GatewayVertexConfig) {
  return new URL(`${vertexOrigin(config)}/v1beta1/publishers/google/models`);
}

/**
 * Exchanges service account keys for OAuth access tokens. One client is kept
 * per key, so a token is reused until shortly before it expires and concurrent
 * requests share one refresh.
 */
class VertexAccessTokenService {
  private readonly clients = new Map<string, JWT>();

  async getAccessToken(credential: string): Promise<string> {
    const { token } = await this.getClient(credential).getAccessToken();
    if (!token) throw new Error("Google returned no access token");
    return token;
  }

  private getClient(credential: string) {
    const cacheKey = createHash("sha256").update(credential).digest("hex");
    const cached = this.clients.get(cacheKey);
    if (cached) return cached;

    // Built from the email and private key only, so the key's `token_uri` and
    // `universe_domain` cannot redirect the token exchange.
    const key = parseVertexServiceAccountKey(credential);
    const client = new JWT({
      email: key.client_email,
      key: key.private_key,
      scopes: [CLOUD_PLATFORM_SCOPE],
    });
    if (this.clients.size >= MAX_CACHED_CLIENTS) {
      const oldest = this.clients.keys().next().value;
      if (oldest !== undefined) this.clients.delete(oldest);
    }
    this.clients.set(cacheKey, client);
    return client;
  }
}

export const vertexAccessTokens = new VertexAccessTokenService();
