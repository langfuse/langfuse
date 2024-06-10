import { compare, hash } from "bcryptjs";
import { randomUUID } from "crypto";
import * as crypto from "crypto";
import type { OAuthConfig, OAuthUserConfig } from "next-auth/providers/oauth";

export function generateSecretKey() {
  return `sk-lf-${randomUUID()}`;
}

export function generatePublicKey() {
  return `pk-lf-${randomUUID()}`;
}

export function getDisplaySecretKey(secretKey: string) {
  return secretKey.slice(0, 6) + "..." + secretKey.slice(-4);
}

export async function hashSecretKey(key: string) {
  // legacy, uses bcrypt, transformed into hashed key upon first use
  const hashedKey = await hash(key, 11);
  return hashedKey;
}

export async function generateKeySet() {
  const pk = generatePublicKey();
  const sk = generateSecretKey();
  const hashedSk = await hashSecretKey(sk);
  const displaySk = getDisplaySecretKey(sk);

  return {
    pk,
    sk,
    hashedSk,
    displaySk,
  };
}

export async function verifySecretKey(key: string, hashedKey: string) {
  const isValid = await compare(key, hashedKey);
  return isValid;
}

export function createShaHash(privateKey: string, salt: string): string {
  const hash = crypto
    .createHash("sha256")
    .update(privateKey)
    .update(crypto.createHash("sha256").update(salt, "utf8").digest("hex"))
    .digest("hex");

  return hash;
}

export interface CustomSSOUser extends Record<string, any> {
  email: string;
  id: string;
  name: string;
  verified: boolean;
}

export function CustomSSOProvider<P extends CustomSSOUser>(
  options: OAuthUserConfig<P>
): OAuthConfig<P> {
  return {
    id: "custom",
    name: "CustomSSOProvider",
    type: "oauth",
    wellKnown: `${options.issuer}/.well-known/openid-configuration`,
    authorization: { params: { scope: "openid email profile" } },
    checks: ["pkce", "state"],
    idToken: true,
    profile(profile) {
      return {
        id: profile.sub,
        name: profile.name,
        email: profile.email,
        image: null,
      };
    },
    options,
  };
}
