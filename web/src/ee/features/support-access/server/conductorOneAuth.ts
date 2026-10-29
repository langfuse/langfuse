import { createHash } from "node:crypto";

import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

let cachedJwks: { issuer: string; jwks: JWTVerifyGetKey } | undefined;

export function getConductorOneJwks(issuer: string): JWTVerifyGetKey {
  if (cachedJwks?.issuer !== issuer) {
    const url = new URL(`https://${issuer}/auth/v1/jwks`);
    cachedJwks = { issuer, jwks: createRemoteJWKSet(url) };
  }
  return cachedJwks.jwks;
}

// https://www.c1.ai/docs/product/admin/webhooks
export async function verifyConductorOneRequest(params: {
  authorization: string | null;
  rawBody: Buffer;
  issuer: string;
  audience: string;
  jwks: JWTVerifyGetKey;
}): Promise<void> {
  const token = params.authorization?.match(/^bearer (\S+)$/i)?.[1];
  if (!token) throw new Error("Missing bearer token");

  const { payload } = await jwtVerify(token, params.jwks, {
    issuer: params.issuer,
    audience: params.audience,
    algorithms: ["RS256", "ES256", "EdDSA"],
    requiredClaims: ["exp", "htb_s256"],
  });

  const bodyHash = createHash("sha256").update(params.rawBody).digest();
  const accepted = [
    bodyHash.toString("base64"),
    bodyHash.toString("base64url"),
  ];
  if (!accepted.includes(String(payload.htb_s256))) {
    throw new Error("Body hash mismatch");
  }
}
