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

type Es256JwtPublicKey = {
  id: string;
  publicKey: KeyObject;
};

export type Es256JwtSigner = {
  sign<TClaims extends Record<string, unknown>>(input: {
    expiresInSeconds: number;
    claims: TClaims;
    now?: Date;
  }): string;
};

export type Es256JwtVerifier<TClaims extends JwtRegisteredClaims> = {
  verify(input: { token: string; now?: Date }): TClaims;
};

// ES256 is ECDSA P-256 with SHA-256:
// https://www.rfc-editor.org/rfc/rfc7518.html#section-3.4
// RHEL 9's validated OpenSSL provider approves that combination in Table 6:
// https://csrc.nist.gov/CSRC/media/projects/cryptographic-module-validation-program/documents/security-policies/140sp4857.pdf
const Es256JwtHeaderSchema = z.object({
  alg: z.literal("ES256"),
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

function assertP256Key(key: KeyObject): void {
  if (
    key.asymmetricKeyType !== "ec" ||
    key.asymmetricKeyDetails?.namedCurve !== "prime256v1"
  ) {
    throw new Error("JWT signing keys must use the P-256 curve");
  }
}

function parsePrivateKey(value: string): KeyObject {
  const key = createPrivateKey(value.replaceAll("\\n", "\n"));
  assertP256Key(key);
  return key;
}

function parsePublicKey(value: string): KeyObject {
  const key = createPublicKey(value.replaceAll("\\n", "\n"));
  assertP256Key(key);
  return key;
}

export function createEs256JwtSigner(input: {
  privateKey: string;
  keyId: string;
  issuer: string;
  audience: string;
}): Es256JwtSigner {
  const privateKey = parsePrivateKey(input.privateKey);

  return {
    sign: (request) =>
      signEs256Jwt({
        ...request,
        privateKey,
        keyId: input.keyId,
        issuer: input.issuer,
        audience: input.audience,
      }),
  };
}

export function createEs256JwtVerifier<
  TClaims extends JwtRegisteredClaims,
>(input: {
  publicKeys: Array<{ id: string; publicKey: string }>;
  issuer: string;
  audience: string;
  claimsSchema: z.ZodType<TClaims>;
}): Es256JwtVerifier<TClaims> {
  const publicKeys = input.publicKeys.map((key) => ({
    id: key.id,
    publicKey: parsePublicKey(key.publicKey),
  }));

  return {
    verify: (request) =>
      verifyEs256Jwt({
        ...request,
        publicKeys,
        issuer: input.issuer,
        audience: input.audience,
        claimsSchema: input.claimsSchema,
      }),
  };
}

function signEs256Jwt<TClaims extends Record<string, unknown>>(input: {
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
    alg: "ES256",
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
  const signature = sign("sha256", Buffer.from(signingInput, "utf8"), {
    key: input.privateKey,
    dsaEncoding: "ieee-p1363",
  }).toString("base64url");

  return `${signingInput}.${signature}`;
}

function verifyEs256Jwt<TClaims extends JwtRegisteredClaims>(input: {
  token: string;
  issuer: string;
  audience: string;
  publicKeys: Es256JwtPublicKey[];
  claimsSchema: z.ZodType<TClaims>;
  now?: Date;
}): TClaims {
  const parts = input.token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT");
  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  const header = Es256JwtHeaderSchema.parse(decodeJson(encodedHeader));
  const key = input.publicKeys.find((candidate) => candidate.id === header.kid);
  if (!key) throw new Error("Unknown JWT signing key");

  const validSignature = verify(
    "sha256",
    Buffer.from(`${encodedHeader}.${encodedPayload}`, "utf8"),
    { key: key.publicKey, dsaEncoding: "ieee-p1363" },
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
