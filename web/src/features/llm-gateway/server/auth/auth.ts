import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod/v4";

import {
  createEd25519JwtSigner,
  createEd25519JwtVerifier,
  type Ed25519JwtSigner,
  type Ed25519JwtVerifier,
} from "@/src/server/utils/jwt";

const RESOLVE_METHOD = "POST";
const RESOLVE_PATH = "/api/internal/ai-gateway/v1/resolve";
export const GATEWAY_INGESTION_TOKEN_TTL_SECONDS = 15 * 60;

type GatewayHmacMessageInput = {
  timestamp: number;
  virtualSecretKey: string;
  requestBody: string;
};

type GatewayServiceKey = {
  secret: string;
};

const GatewayIngestionClaimsSchema = z.object({
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

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function buildGatewayHmacCanonicalMessage(
  input: GatewayHmacMessageInput,
): string {
  return [
    input.timestamp.toString(),
    sha256(input.virtualSecretKey),
    RESOLVE_PATH,
    RESOLVE_METHOD,
    sha256(input.requestBody),
  ].join("\n");
}

function createGatewayHmacSignature(
  input: GatewayHmacMessageInput & { serviceKey: string },
): string {
  return createHmac("sha256", input.serviceKey)
    .update(buildGatewayHmacCanonicalMessage(input), "utf8")
    .digest("base64url");
}

export function verifyGatewayHmacAuthorization(input: {
  header: string | undefined;
  virtualSecretKey: string;
  requestBody: string;
  keys: GatewayServiceKey[];
  now?: Date;
}): boolean {
  const match = /^HMAC timestamp=(\d+),signature=([A-Za-z0-9_-]{43})$/.exec(
    input.header ?? "",
  );
  if (!match) return false;

  const [, timestampValue, signature] = match;
  const timestamp = Number(timestampValue);
  const now = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (!Number.isSafeInteger(timestamp) || Math.abs(now - timestamp) > 300) {
    return false;
  }
  return input.keys.some((key) =>
    safeEqual(
      signature,
      createGatewayHmacSignature({
        timestamp,
        virtualSecretKey: input.virtualSecretKey,
        requestBody: input.requestBody,
        serviceKey: key.secret,
      }),
    ),
  );
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function createGatewayIngestionTokenSigner(input: {
  privateKey: string;
  keyId: string;
  issuer: string;
  audience: string;
}): Ed25519JwtSigner {
  return createEd25519JwtSigner(input);
}

export function createGatewayIngestionTokenVerifier(input: {
  publicKeys: Array<{ id: string; publicKey: string }>;
  issuer: string;
  audience: string;
}): Ed25519JwtVerifier<GatewayIngestionClaims> {
  return createEd25519JwtVerifier({
    ...input,
    claimsSchema: GatewayIngestionClaimsSchema,
  });
}

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

export function verifyGatewayIngestionToken(input: {
  verifier: Ed25519JwtVerifier<GatewayIngestionClaims>;
  token: string;
  now?: Date;
}): GatewayIngestionClaims {
  return input.verifier.verify({ token: input.token, now: input.now });
}
