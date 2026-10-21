import { createHash, createPublicKey } from "node:crypto";

type GatewayJwtKeyConfig = {
  privateKey: string | undefined;
  publicKey: string | undefined;
  keyId: string | undefined;
};

let cached:
  | { input: GatewayJwtKeyConfig; resolved: GatewayJwtKeyConfig }
  | undefined;

/**
 * Fills in the current ES256 key pair from what is configured: a missing
 * public key is derived from the private key, and a missing key ID defaults
 * to the public key's JWK thumbprint.
 */
export function resolveGatewayJwtKeys(
  input: GatewayJwtKeyConfig,
): GatewayJwtKeyConfig {
  if (
    cached &&
    cached.input.privateKey === input.privateKey &&
    cached.input.publicKey === input.publicKey &&
    cached.input.keyId === input.keyId
  ) {
    return cached.resolved;
  }

  const publicKey =
    input.publicKey ??
    (input.privateKey ? derivePublicKeyPem(input.privateKey) : undefined);
  const keyId =
    input.keyId ?? (publicKey ? deriveGatewayJwtKeyId(publicKey) : undefined);
  const resolved = { privateKey: input.privateKey, publicKey, keyId };

  cached = { input: { ...input }, resolved };
  return resolved;
}

/**
 * deriveGatewayJwtKeyId returns the RFC 7638 JWK thumbprint of a public key, so
 * every replica holding the same key agrees on the key ID without configuring one.
 */
export function deriveGatewayJwtKeyId(publicKeyPem: string): string {
  const jwk = createPublicKey(publicKeyPem.replaceAll("\\n", "\n")).export({
    format: "jwk",
  });
  const canonical = JSON.stringify({
    crv: jwk.crv,
    kty: jwk.kty,
    x: jwk.x,
    y: jwk.y,
  });
  return createHash("sha256").update(canonical).digest("base64url");
}

/** derivePublicKeyPem accepts PKCS#8 (`PRIVATE KEY`) and SEC1 (`EC PRIVATE KEY`) PEMs. */
function derivePublicKeyPem(privateKeyPem: string): string {
  return createPublicKey(privateKeyPem.replaceAll("\\n", "\n"))
    .export({ type: "spki", format: "pem" })
    .toString();
}
