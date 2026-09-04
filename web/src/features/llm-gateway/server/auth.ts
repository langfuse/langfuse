import {
  createHmac,
  createPrivateKey,
  createPublicKey,
  randomUUID,
  sign,
  timingSafeEqual,
  verify,
} from "node:crypto";

import { z } from "zod/v4";

import type { GatewayApiFormat } from "./providerRegistry";

const RESOLVE_METHOD = "POST";
const RESOLVE_PATH = "/api/internal/ai-gateway/v1/resolve";
const INGESTION_TOKEN_TTL_SECONDS = 15 * 60;

type GatewayHmacMessageInput = {
  timestamp: number;
  apiFormat: GatewayApiFormat;
};

type GatewayServiceKey = {
  id: string;
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

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function normalizePem(value: string): string {
  return value.replaceAll("\\n", "\n");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function buildGatewayHmacCanonicalMessage(
  input: GatewayHmacMessageInput,
): string {
  return [
    RESOLVE_METHOD,
    RESOLVE_PATH,
    input.timestamp.toString(),
    input.apiFormat,
  ].join("\n");
}

export function createGatewayHmacSignature(
  input: GatewayHmacMessageInput & { serviceKey: string },
): string {
  return createHmac("sha256", input.serviceKey)
    .update(buildGatewayHmacCanonicalMessage(input), "utf8")
    .digest("hex");
}

export function verifyGatewayHmacAuthorization(input: {
  header: string | undefined;
  apiFormat: GatewayApiFormat;
  keys: GatewayServiceKey[];
  now?: Date;
}): boolean {
  const match =
    /^HMAC keyId=([^,\s]+),timestamp=(\d+),signature=([a-f0-9]{64})$/.exec(
      input.header ?? "",
    );
  if (!match) return false;

  const [, keyId, timestampValue, signature] = match;
  const timestamp = Number(timestampValue);
  const now = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (!Number.isSafeInteger(timestamp) || Math.abs(now - timestamp) > 300) {
    return false;
  }
  const key = input.keys.find((candidate) => candidate.id === keyId);
  if (!key) return false;

  const expected = createGatewayHmacSignature({
    timestamp,
    apiFormat: input.apiFormat,
    serviceKey: key.secret,
  });
  return safeEqual(signature, expected);
}

export function issueGatewayIngestionToken(input: {
  privateKey: string;
  keyId: string;
  issuer: string;
  audience: string;
  now?: Date;
  claims: Pick<
    GatewayIngestionClaims,
    "organizationId" | "projectId" | "keyId" | "instrumentation_mode"
  >;
}): string {
  const iat = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const header = encodeJson({ alg: "EdDSA", typ: "JWT", kid: input.keyId });
  const payload = encodeJson({
    version: 1,
    ...input.claims,
    scope: "gateway-ingest",
    iat,
    exp: iat + INGESTION_TOKEN_TTL_SECONDS,
    iss: input.issuer,
    aud: input.audience,
    jti: randomUUID(),
  });
  const signingInput = `${header}.${payload}`;
  const signature = sign(
    null,
    Buffer.from(signingInput, "utf8"),
    createPrivateKey(normalizePem(input.privateKey)),
  ).toString("base64url");
  return `${signingInput}.${signature}`;
}

export function verifyGatewayIngestionToken(input: {
  token: string;
  issuer: string;
  audience: string;
  publicKeys: Array<{ id: string; publicKey: string }>;
  now?: Date;
}): GatewayIngestionClaims {
  const parts = input.token.split(".");
  if (parts.length !== 3) throw new Error("Invalid gateway ingestion token");
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = z
    .object({
      alg: z.literal("EdDSA"),
      typ: z.literal("JWT"),
      kid: z.string(),
    })
    .parse(
      JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8")),
    );
  const key = input.publicKeys.find((candidate) => candidate.id === header.kid);
  if (!key) throw new Error("Unknown gateway ingestion signing key");

  const valid = verify(
    null,
    Buffer.from(`${encodedHeader}.${encodedPayload}`, "utf8"),
    createPublicKey(normalizePem(key.publicKey)),
    Buffer.from(encodedSignature, "base64url"),
  );
  if (!valid) throw new Error("Invalid gateway ingestion token signature");

  const claims = GatewayIngestionClaimsSchema.parse(
    JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")),
  );
  const now = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (
    claims.iss !== input.issuer ||
    claims.aud !== input.audience ||
    claims.exp <= now
  ) {
    throw new Error("Invalid gateway ingestion token claims");
  }
  return claims;
}
