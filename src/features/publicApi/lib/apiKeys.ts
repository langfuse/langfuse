import { compare, hash } from "bcryptjs";
import { randomUUID } from "crypto";

export function generateSecretKey() {
  return `sk-lf-${randomUUID()}`;
}

export function generatePublishableKey() {
  return `pk-lf-${randomUUID()}`;
}

export function getDisplaySecretKey(secretKey: string) {
  return secretKey.slice(0, 6) + "..." + secretKey.slice(-4);
}

export async function hashSecretKey(key: string) {
  const hashedKey = await hash(key, 12);
  return hashedKey;
}

export async function generateKeySet() {
  const pk = generatePublishableKey();
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
