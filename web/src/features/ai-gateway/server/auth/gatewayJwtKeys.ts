import { deriveEs256KeyId, deriveEs256PublicKey } from "@/src/server/utils/jwt";

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
    (input.privateKey ? deriveEs256PublicKey(input.privateKey) : undefined);
  const keyId =
    input.keyId ?? (publicKey ? deriveEs256KeyId(publicKey) : undefined);
  const resolved = { privateKey: input.privateKey, publicKey, keyId };

  cached = { input: { ...input }, resolved };
  return resolved;
}
