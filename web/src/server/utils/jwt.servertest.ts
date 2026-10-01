import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";
import { z } from "zod/v4";

import {
  createEs256JwtSigner,
  createEs256JwtVerifier,
  type JwtRegisteredClaims,
} from "@/src/server/utils/jwt";

const TestClaimsSchema = z.object({
  subjectId: z.string().min(1),
  role: z.enum(["reader", "writer"]),
  iss: z.string(),
  aud: z.string(),
  exp: z.number().int(),
  iat: z.number().int(),
  jti: z.string(),
});

type TestClaims = z.infer<typeof TestClaimsSchema> & JwtRegisteredClaims;

function generatePemKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "P-256",
  });
  return {
    privateKey: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    publicKey: publicKey.export({ format: "pem", type: "spki" }).toString(),
  };
}

const now = new Date("2026-09-07T12:00:00.000Z");

function signToken(input: {
  privateKey: string;
  keyId: string;
  claims?: Record<string, unknown>;
  issuer?: string;
  audience?: string;
}) {
  return createEs256JwtSigner({
    privateKey: input.privateKey,
    keyId: input.keyId,
    issuer: input.issuer ?? "test-issuer",
    audience: input.audience ?? "test-audience",
  }).sign({
    expiresInSeconds: 60,
    now,
    claims: input.claims ?? { subjectId: "subject-1", role: "reader" },
  });
}

function verifyToken(
  token: string,
  publicKeys: Array<{ id: string; publicKey: string }>,
  overrides: Partial<{
    issuer: string;
    audience: string;
    now: Date;
  }> = {},
): TestClaims {
  return createEs256JwtVerifier({
    publicKeys,
    claimsSchema: TestClaimsSchema,
    issuer: overrides.issuer ?? "test-issuer",
    audience: overrides.audience ?? "test-audience",
  }).verify({
    token,
    now: overrides.now ?? now,
  });
}

describe("ES256 JWT utilities", () => {
  it("emits the JWS ES256 header and fixed-width signature", () => {
    const key = generatePemKeyPair();
    const token = signToken({ ...key, keyId: "current" });
    const [encodedHeader, , encodedSignature] = token.split(".");

    expect(
      JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8")),
    ).toEqual({ alg: "ES256", typ: "JWT", kid: "current" });
    expect(Buffer.from(encodedSignature, "base64url")).toHaveLength(64);
  });

  it("rejects signing keys on other EC curves", () => {
    const { privateKey } = generateKeyPairSync("ec", {
      namedCurve: "P-384",
    });
    const pem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();

    expect(() =>
      createEs256JwtSigner({
        privateKey: pem,
        keyId: "current",
        issuer: "test-issuer",
        audience: "test-audience",
      }),
    ).toThrow("JWT signing keys must use the P-256 curve");
  });

  it("reuses constructed signer and verifier keys across operations", () => {
    const key = generatePemKeyPair();
    const signer = createEs256JwtSigner({
      privateKey: key.privateKey.replaceAll("\n", "\\n"),
      keyId: "current",
      issuer: "test-issuer",
      audience: "test-audience",
    });
    const verifier = createEs256JwtVerifier({
      publicKeys: [
        {
          id: "current",
          publicKey: key.publicKey.replaceAll("\n", "\\n"),
        },
      ],
      issuer: "test-issuer",
      audience: "test-audience",
      claimsSchema: TestClaimsSchema,
    });

    for (const subjectId of ["subject-1", "subject-2"]) {
      const claims = verifier.verify({
        token: signer.sign({
          expiresInSeconds: 60,
          now,
          claims: { subjectId, role: "reader" },
        }),
        now,
      });

      expect(claims.subjectId).toBe(subjectId);
    }
  });

  it("selects current and previous verification keys by kid", () => {
    const current = generatePemKeyPair();
    const previous = generatePemKeyPair();
    const publicKeys = [
      { id: "current", publicKey: current.publicKey },
      { id: "previous", publicKey: previous.publicKey },
    ];

    const currentClaims = verifyToken(
      signToken({ ...current, keyId: "current" }),
      publicKeys,
    );
    const previousClaims = verifyToken(
      signToken({ ...previous, keyId: "previous" }),
      publicKeys,
    );

    expect(currentClaims).toMatchObject({
      subjectId: "subject-1",
      role: "reader",
      iss: "test-issuer",
      aud: "test-audience",
    });
    expect(previousClaims.subjectId).toBe("subject-1");
    expect(currentClaims.exp - currentClaims.iat).toBe(60);
    expect(currentClaims.jti).toEqual(expect.any(String));
  });

  it("rejects unknown keys and invalid signatures", () => {
    const trusted = generatePemKeyPair();
    const untrusted = generatePemKeyPair();

    expect(() =>
      verifyToken(signToken({ ...trusted, keyId: "missing" }), [
        { id: "current", publicKey: trusted.publicKey },
      ]),
    ).toThrow("Unknown JWT signing key");

    expect(() =>
      verifyToken(signToken({ ...untrusted, keyId: "current" }), [
        { id: "current", publicKey: trusted.publicKey },
      ]),
    ).toThrow("Invalid JWT signature");
  });

  it("rejects expired tokens and mismatched issuer or audience", () => {
    const key = generatePemKeyPair();
    const token = signToken({ ...key, keyId: "current" });
    const publicKeys = [{ id: "current", publicKey: key.publicKey }];

    expect(() =>
      verifyToken(token, publicKeys, {
        now: new Date(now.getTime() + 60_000),
      }),
    ).toThrow("Invalid JWT claims");
    expect(() =>
      verifyToken(token, publicKeys, { issuer: "other-issuer" }),
    ).toThrow("Invalid JWT claims");
    expect(() =>
      verifyToken(token, publicKeys, { audience: "other-audience" }),
    ).toThrow("Invalid JWT claims");
  });

  it("validates application claims with the caller-provided schema", () => {
    const key = generatePemKeyPair();
    const token = signToken({
      ...key,
      keyId: "current",
      claims: { subjectId: "", role: "admin" },
    });

    expect(() =>
      verifyToken(token, [{ id: "current", publicKey: key.publicKey }]),
    ).toThrow();
  });
});
