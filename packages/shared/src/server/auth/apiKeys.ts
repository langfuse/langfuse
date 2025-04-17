import { PrismaClient, ApiKeyScope } from "@prisma/client";
import { compare, hash } from "bcryptjs";
import { randomUUID } from "crypto";
import * as crypto from "crypto";
import { env } from "../../env";

export function getDisplaySecretKey(secretKey: string) {
  return secretKey.slice(0, 6) + "..." + secretKey.slice(-4);
}

export async function hashSecretKey(key: string) {
  // legacy, uses bcrypt, transformed into hashed key upon first use
  const hashedKey = await hash(key, 11);
  return hashedKey;
}

async function generateKeySet() {
  return {
    pk: `pk-lf-${randomUUID()}`,
    sk: `sk-lf-${randomUUID()}`,
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

export async function createAndAddApiKeysToDb(p: {
  prisma: PrismaClient;
  entityId: string;
  scope: ApiKeyScope;
  note?: string;
  predefinedKeys?: {
    secretKey: string;
    publicKey: string;
  };
}) {
  const salt = env.SALT;
  if (!salt) {
    throw new Error("SALT is not set");
  }

  const { pk, sk } = p.predefinedKeys
    ? { pk: p.predefinedKeys.publicKey, sk: p.predefinedKeys.secretKey }
    : await generateKeySet();

  const hashedSk = await hashSecretKey(sk);
  const displaySk = getDisplaySecretKey(sk);

  const hashFromProvidedKey = createShaHash(sk, salt);

  const entity =
    p.scope === "PROJECT" ? { projectId: p.entityId } : { orgId: p.entityId };

  const apiKey = await p.prisma.apiKey.create({
    data: {
      ...entity,
      publicKey: pk,
      hashedSecretKey: hashedSk,
      displaySecretKey: displaySk,
      fastHashedSecretKey: hashFromProvidedKey,
      note: p.note,
      scope: p.scope,
    },
  });

  return {
    id: apiKey.id,
    createdAt: apiKey.createdAt,
    note: apiKey.note,
    publicKey: apiKey.publicKey,
    secretKey: sk,
    displaySecretKey: displaySk,
  };
}
