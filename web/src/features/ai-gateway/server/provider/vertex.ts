import { GCPServiceAccountKeySchema } from "@langfuse/shared";
import { generateVertexAccessTokenForServiceAccount } from "@langfuse/shared/src/server";
import { z } from "zod/v4";

// Kept in sync with the gateway's base URL check: the location becomes a DNS
// label of a fixed Google host and the project a path segment, so neither may
// change the host or the path.
const VERTEX_SEGMENT_PATTERN = /^[a-z0-9-]+$/;

export const GatewayVertexConfigSchema = z
  .object({ location: z.string().regex(VERTEX_SEGMENT_PATTERN) })
  .strict();
export type GatewayVertexConfig = z.infer<typeof GatewayVertexConfigSchema>;

export class UnsupportedVertexProjectIdError extends Error {
  constructor() {
    super(
      "The service account key's project ID may only contain lowercase letters, digits and hyphens",
    );
    this.name = "UnsupportedVertexProjectIdError";
  }
}

/** Throws unless the credential is a service account key for a project the gateway can address. */
export function parseVertexServiceAccountKey(credential: string) {
  const key = GCPServiceAccountKeySchema.parse(JSON.parse(credential));
  if (!VERTEX_SEGMENT_PATTERN.test(key.project_id)) {
    throw new UnsupportedVertexProjectIdError();
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

/** Throws `VertexTokenExchangeError` when Google rejects the key or cannot be reached. */
export function getVertexAccessToken(credential: string) {
  return generateVertexAccessTokenForServiceAccount(
    parseVertexServiceAccountKey(credential),
  );
}
