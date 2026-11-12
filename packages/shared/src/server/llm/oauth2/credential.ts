import { createHash } from "node:crypto";
import { importJWK, SignJWT, type CryptoKey, type JWK } from "jose";
import {
  CLIENT_SECRET_JWT_ALGORITHMS,
  PRIVATE_KEY_JWT_ALGORITHMS,
  type OAuth2AuthMethod,
  type ResolvedOAuth2Profile,
} from "../../../interfaces/oauth2Providers";
import { clientAssertionSigningError, OAuth2TokenError } from "./errors";

export type PreparedOAuth2Credential = {
  // client_secret_basic / client_secret_post
  secret?: string;
  // JWT methods; Uint8Array holds the HMAC secret bytes for client_secret_jwt
  signingKey?: CryptoKey | Uint8Array;
  // resolved JWS alg for JWT methods
  algorithm?: string;
  // private_key_jwt only
  protectedHeader?: { kid?: string; "x5t#S256"?: string; x5t?: string };
  // sha256 hex of the decrypted secret string
  fingerprint: string;
};

// RFC 7518 §3.2: the HMAC key must be at least as long as the hash output.
const HMAC_MIN_SECRET_BYTES: Record<string, number> = {
  HS256: 32,
  HS384: 48,
  HS512: 64,
};

const EC_CURVE_BY_ALGORITHM: Record<string, string> = {
  ES256: "P-256",
  ES384: "P-384",
  ES512: "P-521",
};

const configError = (message: string) =>
  new OAuth2TokenError("config", message);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const optionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

/**
 * Validates the decrypted secret of an OAuth2 LLM connection against its
 * resolved profile and turns it into what the token client needs to
 * authenticate. Every problem is an `OAuth2TokenError` of kind `config`
 * whose message never contains key material. `verifySigning` adds a trial
 * signature, meant for validating a secret when it is saved.
 */
export async function prepareOAuth2Credential(
  profile: ResolvedOAuth2Profile,
  decryptedSecret: string,
  { verifySigning = false }: { verifySigning?: boolean } = {},
): Promise<PreparedOAuth2Credential> {
  const fingerprint = createHash("sha256")
    .update(decryptedSecret)
    .digest("hex");

  switch (profile.authMethod) {
    case "client_secret_basic":
    case "client_secret_post":
      if (decryptedSecret.trim().length === 0) {
        throw configError("Client secret is required");
      }
      return { secret: decryptedSecret, fingerprint };
    case "client_secret_jwt":
      return { ...prepareHmacKey(profile, decryptedSecret), fingerprint };
    case "private_key_jwt":
      return {
        ...(await preparePrivateKey(profile, decryptedSecret, verifySigning)),
        fingerprint,
      };
  }
}

function prepareHmacKey(profile: ResolvedOAuth2Profile, secret: string) {
  const algorithm = profile.assertionAlgorithm ?? "HS256";
  if (
    !(CLIENT_SECRET_JWT_ALGORITHMS as readonly string[]).includes(algorithm)
  ) {
    throw configError(
      `client_secret_jwt algorithm must be one of ${CLIENT_SECRET_JWT_ALGORITHMS.join(", ")}`,
    );
  }
  const signingKey = new TextEncoder().encode(secret);
  const minBytes = HMAC_MIN_SECRET_BYTES[algorithm];
  if (signingKey.byteLength < minBytes) {
    throw configError(
      `Client secret must be at least ${minBytes} bytes for ${algorithm}`,
    );
  }
  return { signingKey, algorithm };
}

async function preparePrivateKey(
  profile: ResolvedOAuth2Profile,
  secret: string,
  verifySigning: boolean,
) {
  const jwk = parsePrivateJwk(secret);
  const algorithm = resolvePrivateKeyAlgorithm(profile, jwk);

  let signingKey: CryptoKey | Uint8Array;
  try {
    signingKey = await importJWK(jwk as JWK, algorithm);
  } catch {
    // The jose error is dropped on purpose: it may describe the key.
    throw configError("The private JWK could not be imported");
  }
  if (verifySigning) {
    try {
      await new SignJWT({})
        .setProtectedHeader({ alg: algorithm })
        .sign(signingKey);
    } catch {
      throw clientAssertionSigningError();
    }
  }

  return {
    signingKey,
    algorithm,
    protectedHeader: buildProtectedHeader(profile, jwk),
  };
}

function parsePrivateJwk(secret: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(secret.trim());
  } catch {
    throw configError("Private key must be a JWK in JSON format");
  }
  if (!isRecord(parsed)) {
    throw configError("Private key must be a JWK (a JSON object)");
  }
  if ("keys" in parsed) {
    throw configError(
      'Paste a single private JWK, not a JWKS ({"keys": [...]})',
    );
  }
  if (parsed.kty !== "RSA" && parsed.kty !== "EC") {
    throw configError(
      "Unsupported kty in JWK: only RSA and EC private keys are supported",
    );
  }
  if (optionalString(parsed.d) === undefined) {
    throw configError(
      'Private JWK required: the key has no private part ("d")',
    );
  }
  return parsed;
}

function resolvePrivateKeyAlgorithm(
  profile: ResolvedOAuth2Profile,
  jwk: Record<string, unknown>,
): string {
  const jwkAlg = jwk.alg;
  if (
    jwkAlg !== undefined &&
    (typeof jwkAlg !== "string" ||
      !(PRIVATE_KEY_JWT_ALGORITHMS as readonly string[]).includes(jwkAlg))
  ) {
    throw configError(
      `JWK alg must be one of ${PRIVATE_KEY_JWT_ALGORITHMS.join(", ")}`,
    );
  }

  const algorithm =
    profile.assertionAlgorithm ??
    (jwkAlg as string | undefined) ??
    defaultAlgorithm(profile, jwk);

  if (algorithm.startsWith("ES")) {
    const curve = EC_CURVE_BY_ALGORITHM[algorithm];
    if (jwk.kty !== "EC" || jwk.crv !== curve) {
      throw configError(`${algorithm} requires an EC key on curve ${curve}`);
    }
  } else if (jwk.kty !== "RSA") {
    throw configError(`${algorithm} requires an RSA key`);
  }
  return algorithm;
}

function defaultAlgorithm(
  profile: ResolvedOAuth2Profile,
  jwk: Record<string, unknown>,
): string {
  if (jwk.kty === "RSA") return profile.defaultRsaAlgorithm;
  const algorithm = Object.entries(EC_CURVE_BY_ALGORITHM).find(
    ([, curve]) => curve === jwk.crv,
  )?.[0];
  if (!algorithm) {
    throw configError("Unsupported EC curve in JWK: use P-256, P-384 or P-521");
  }
  return algorithm;
}

function buildProtectedHeader(
  profile: ResolvedOAuth2Profile,
  jwk: Record<string, unknown>,
): NonNullable<PreparedOAuth2Credential["protectedHeader"]> {
  const kid = optionalString(jwk.kid);
  const x5t = optionalString(jwk.x5t);
  let x5tS256 = optionalString(jwk["x5t#S256"]);

  if (!x5tS256 && profile.requireX5tS256) {
    x5tS256 = certificateThumbprint(jwk.x5c);
  }

  return {
    ...(kid ? { kid } : {}),
    ...(x5tS256 ? { "x5t#S256": x5tS256 } : {}),
    ...(x5t ? { x5t } : {}),
  };
}

// base64url SHA-256 of the DER certificate in x5c[0] (RFC 7517 §4.7, §4.9).
function certificateThumbprint(x5c: unknown): string {
  if (!Array.isArray(x5c) || x5c.length === 0) {
    throw configError(
      'This provider requires the JWK to include "x5t#S256" or the certificate in "x5c"',
    );
  }
  const certificate = x5c[0];
  if (
    typeof certificate !== "string" ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(certificate)
  ) {
    throw configError('JWK "x5c" must hold base64-encoded DER certificates');
  }
  return createHash("sha256")
    .update(Buffer.from(certificate, "base64"))
    .digest("base64url");
}

/**
 * Display value for the secret of an OAuth2 connection: the JWK `kid` for
 * private_key_jwt (the key itself is never shown), else the last four
 * characters of the client secret.
 */
export function getOAuth2DisplaySecretKey(
  authMethod: OAuth2AuthMethod,
  secret: string,
): string {
  if (authMethod !== "private_key_jwt") {
    return `...${secret.slice(-4)}`;
  }
  try {
    const parsed: unknown = JSON.parse(secret.trim());
    const kid = isRecord(parsed) ? optionalString(parsed.kid) : undefined;
    return kid ? `kid:${kid}` : "kid:none";
  } catch {
    return "kid:none";
  }
}
