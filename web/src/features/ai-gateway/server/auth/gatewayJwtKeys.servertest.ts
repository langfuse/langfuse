import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  createEs256JwtSigner,
  createEs256JwtVerifier,
} from "@/src/server/utils/jwt";
import { z } from "zod/v4";

import { resolveGatewayJwtKeys } from "./gatewayJwtKeys";

const keyPair = generateKeyPairSync("ec", { namedCurve: "P-256" });
const publicKeyPem = keyPair.publicKey
  .export({ type: "spki", format: "pem" })
  .toString();
const pkcs8Pem = keyPair.privateKey
  .export({ type: "pkcs8", format: "pem" })
  .toString();
// What Helm's `genPrivateKey "ecdsa"` emits.
const sec1Pem = keyPair.privateKey
  .export({ type: "sec1", format: "pem" })
  .toString();

describe("resolveGatewayJwtKeys", () => {
  it.each([
    { format: "PKCS#8", privateKey: pkcs8Pem },
    { format: "SEC1", privateKey: sec1Pem },
    { format: "escaped SEC1", privateKey: sec1Pem.replaceAll("\n", "\\n") },
  ])(
    "derives a working public key and key ID from a $format private key",
    ({ privateKey }) => {
      const resolved = resolveGatewayJwtKeys({
        privateKey,
        publicKey: undefined,
        keyId: undefined,
      });

      expect(resolved.publicKey).toBe(publicKeyPem);
      expect(resolved.keyId).toBe(
        resolveGatewayJwtKeys({
          privateKey: undefined,
          publicKey: publicKeyPem,
          keyId: undefined,
        }).keyId,
      );

      const token = createEs256JwtSigner({
        privateKey,
        keyId: resolved.keyId!,
        issuer: "issuer",
        audience: "audience",
      }).sign({ expiresInSeconds: 60, claims: {} });
      const verifier = createEs256JwtVerifier({
        publicKeys: [{ id: resolved.keyId!, publicKey: resolved.publicKey! }],
        issuer: "issuer",
        audience: "audience",
        claimsSchema: z.object({
          iss: z.string(),
          aud: z.string(),
          exp: z.number(),
          iat: z.number(),
          jti: z.string(),
        }),
      });
      expect(() => verifier.verify({ token })).not.toThrow();
    },
  );

  it("keeps explicitly configured values", () => {
    expect(
      resolveGatewayJwtKeys({
        privateKey: "private",
        publicKey: "public",
        keyId: "current",
      }),
    ).toEqual({ privateKey: "private", publicKey: "public", keyId: "current" });
  });

  it("leaves an unconfigured deployment without keys", () => {
    expect(
      resolveGatewayJwtKeys({
        privateKey: undefined,
        publicKey: undefined,
        keyId: undefined,
      }),
    ).toEqual({
      privateKey: undefined,
      publicKey: undefined,
      keyId: undefined,
    });
  });
});
