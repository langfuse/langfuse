import { z } from "zod/v4";

import type { Ed25519JwtSigner } from "@/src/server/utils/jwt";

export const GATEWAY_INGESTION_TOKEN_TTL_SECONDS = 15 * 60;

export const GatewayIngestionClaimsSchema = z.object({
  version: z.literal(1),
  organizationId: z.string(),
  projectId: z.string(),
  keyId: z.string(),
  instrumentation_mode: z.enum(["usage", "full"]),
  scope: z.literal("gateway-ingest"),
  exp: z.number().int(),
  iss: z.string(),
  aud: z.string(),
  iat: z.number().int(),
  jti: z.string(),
});

export type GatewayIngestionClaims = z.infer<
  typeof GatewayIngestionClaimsSchema
>;

export function issueGatewayIngestionToken(input: {
  signer: Ed25519JwtSigner;
  now?: Date;
  claims: Pick<
    GatewayIngestionClaims,
    "organizationId" | "projectId" | "keyId" | "instrumentation_mode"
  >;
}): string {
  return input.signer.sign({
    expiresInSeconds: GATEWAY_INGESTION_TOKEN_TTL_SECONDS,
    now: input.now,
    claims: {
      version: 1,
      ...input.claims,
      scope: "gateway-ingest",
    },
  });
}
