import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import { deriveEs256KeyId } from "@/src/server/utils/jwt";

import { resolveGatewayJwtKeys } from "./gatewayJwtKeys";

const keyPair = generateKeyPairSync("ec", { namedCurve: "P-256" });
const publicKeyPem = keyPair.publicKey
  .export({ type: "spki", format: "pem" })
  .toString();
const privateKeyPem = keyPair.privateKey
  .export({ type: "sec1", format: "pem" })
  .toString();

describe("resolveGatewayJwtKeys", () => {
  it("derives the public key and key ID from only a private key", () => {
    expect(
      resolveGatewayJwtKeys({
        privateKey: privateKeyPem,
        publicKey: undefined,
        keyId: undefined,
      }),
    ).toEqual({
      privateKey: privateKeyPem,
      publicKey: publicKeyPem,
      keyId: deriveEs256KeyId(publicKeyPem),
    });
  });

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
