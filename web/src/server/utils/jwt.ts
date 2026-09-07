import {
  createPrivateKey,
  createPublicKey,
  type KeyObject,
  randomUUID,
  sign,
  verify,
} from "node:crypto";

import { z } from "zod/v4";

export type JwtRegisteredClaims = {
  iss: string;
  aud: string;
  exp: number;
  iat: number;
  jti: string;
};

export type Ed25519JwtPublicKey = {
  id: string;
  publicKey: KeyObject;
};

export type Ed25519JwtSigner = {
  sign<TClaims extends Record<string, unknown>>(input: {
    expiresInSeconds: number;
    claims: TClaims;
    now?: Date;
  }): string;
};

export type Ed25519JwtVerifier<TClaims extends JwtRegisteredClaims> = {
  verify(input: { token: string; now?: Date }): TClaims;
};

const Ed25519JwtHeaderSchema = z.object({
  alg: z.literal("EdDSA"),
  typ: z.literal("JWT"),
  kid: z.string().min(1),
});

const JwtRegisteredClaimsSchema = z.object({
  iss: z.string(),
  aud: z.string(),
  exp: z.number().int(),
  iat: z.number().int(),
  jti: z.string(),
});

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeJson(value: string): unknown {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

function parsePrivateKey(value: string): KeyObject {
  return createPrivateKey(value.replaceAll("\\n", "\n"));
}

function parsePublicKey(value: string): KeyObject {
  return createPublicKey(value.replaceAll("\\n", "\n"));
}

export function createEd25519JwtSigner(input: {
  privateKey: string;
  keyId: string;
  issuer: string;
  audience: string;
}): Ed25519JwtSigner {
  const privateKey = parsePrivateKey(input.privateKey);

  return {
    sign: (request) =>
      signEd25519Jwt({
        ...request,
        privateKey,
        keyId: input.keyId,
        issuer: input.issuer,
        audience: input.audience,
      }),
  };
}

export function createEd25519JwtVerifier<
  TClaims extends JwtRegisteredClaims,
>(input: {
  publicKeys: Array<{ id: string; publicKey: string }>;
  issuer: string;
  audience: string;
  claimsSchema: z.ZodType<TClaims>;
}): Ed25519JwtVerifier<TClaims> {
  const publicKeys = input.publicKeys.map((key) => ({
    id: key.id,
    publicKey: parsePublicKey(key.publicKey),
  }));

  return {
    verify: (request) =>
      verifyEd25519Jwt({
        ...request,
        publicKeys,
        issuer: input.issuer,
        audience: input.audience,
        claimsSchema: input.claimsSchema,
      }),
  };
}

export function signEd25519Jwt<TClaims extends Record<string, unknown>>(input: {
  privateKey: KeyObject;
  keyId: string;
  issuer: string;
  audience: string;
  expiresInSeconds: number;
  claims: TClaims;
  now?: Date;
}): string {
  const issuedAt = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const header = encodeJson({
    alg: "EdDSA",
    typ: "JWT",
    kid: input.keyId,
  });
  const payload = encodeJson({
    ...input.claims,
    iat: issuedAt,
    exp: issuedAt + input.expiresInSeconds,
    iss: input.issuer,
    aud: input.audience,
    jti: randomUUID(),
  });
  const signingInput = `${header}.${payload}`;
  const signature = sign(
    null,
    Buffer.from(signingInput, "utf8"),
    input.privateKey,
  ).toString("base64url");

  return `${signingInput}.${signature}`;
}

export function verifyEd25519Jwt<TClaims extends JwtRegisteredClaims>(input: {
  token: string;
  issuer: string;
  audience: string;
  publicKeys: Ed25519JwtPublicKey[];
  claimsSchema: z.ZodType<TClaims>;
  now?: Date;
}): TClaims {
  const parts = input.token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT");
  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  const header = Ed25519JwtHeaderSchema.parse(decodeJson(encodedHeader));
  const key = input.publicKeys.find((candidate) => candidate.id === header.kid);
  if (!key) throw new Error("Unknown JWT signing key");

  const validSignature = verify(
    null,
    Buffer.from(`${encodedHeader}.${encodedPayload}`, "utf8"),
    key.publicKey,
    Buffer.from(encodedSignature, "base64url"),
  );
  if (!validSignature) throw new Error("Invalid JWT signature");

  const decodedClaims = decodeJson(encodedPayload);
  const registeredClaims = JwtRegisteredClaimsSchema.parse(decodedClaims);
  const now = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (
    registeredClaims.iss !== input.issuer ||
    registeredClaims.aud !== input.audience ||
    registeredClaims.exp <= now
  ) {
    throw new Error("Invalid JWT claims");
  }

  return input.claimsSchema.parse(decodedClaims);
}
