import { describe, expect, it, vi } from "vitest";

import { type ApiKey } from "@langfuse/shared/src/db";
import { InternalServerError } from "@langfuse/shared";
import { hashSecretKey } from "@langfuse/shared/src/server";

import { Verifier } from "@/src/features/apiKey/verifier";
import {
  type FindApiKeyResult,
  type ApiKeyRepository,
} from "@/src/features/apiKey/apiKeyRepository";
import { parseAuthorizationHeader } from "@/src/features/apiKey/helpers/parseAuthorizationHeader";

const SALT = "salt";
const ADMIN = "admin-secret";

const apiKey = (over: Partial<ApiKey> = {}): ApiKey =>
  ({
    id: "key_1",
    createdAt: new Date(0),
    note: null,
    publicKey: "pk-lf-1",
    hashedSecretKey: "hsk",
    fastHashedSecretKey: "fhsk",
    displaySecretKey: "sk-...abc",
    lastUsedAt: null,
    expiresAt: null,
    isInAppAgentKey: false,
    projectId: "prj_1",
    orgId: "org_1",
    scope: "PROJECT",
    createdByUserId: null,
    createdByApiKeyId: null,
    ...over,
  }) as ApiKey;

const basicHeader = (pub: string, secret: string) =>
  `Basic ${btoa(`${pub}:${secret}`)}`;

const lookup = (apiKey: ApiKey | null): FindApiKeyResult => ({
  success: true,
  apiKey,
});

const stubStore = (over: Partial<ApiKeyRepository> = {}): ApiKeyRepository =>
  ({
    findByFastHash: vi.fn(async () => lookup(null)),
    findByPublicKey: vi.fn(async () => lookup(null)),
    backfillFastHash: vi.fn(async () => {}),
    ...over,
  }) as unknown as ApiKeyRepository;

const verifier = (store: ApiKeyRepository) => new Verifier(store, SALT, ADMIN);

describe("scheme dispatch", () => {
  it("a missing header is a 401", async () => {
    const result = await verifier(stubStore()).verify(
      parseAuthorizationHeader(undefined),
    );
    expect(result.success).toBe(false);
  });
  it("an unknown scheme is a 401", async () => {
    const result = await verifier(stubStore()).verify(
      parseAuthorizationHeader("Digest x"),
    );
    expect(result.success).toBe(false);
  });
});

describe("Basic authenticates the secret as privateKey", () => {
  it("resolves a key found by its fast hash", async () => {
    const key = apiKey();
    const store = stubStore({
      findByFastHash: vi.fn(async () => lookup(key)),
    });
    const result = await verifier(store).verify(
      parseAuthorizationHeader(basicHeader("pk-lf-1", "sk")),
    );
    expect(result).toMatchObject({
      success: true,
      authorization: "privateKey",
      apiKey: key,
    });
  });
  it("falls back to bcrypt and backfills the fast hash for a NULL-hash key", async () => {
    const key = apiKey({
      fastHashedSecretKey: null,
      hashedSecretKey: await hashSecretKey("sk"),
    });
    const backfill = vi.fn(async () => {});
    const store = stubStore({
      findByPublicKey: vi.fn(async () => lookup(key)),
      backfillFastHash: backfill,
    });
    const result = await verifier(store).verify(
      parseAuthorizationHeader(basicHeader("pk-lf-1", "sk")),
    );
    expect(result.success).toBe(true);
    expect(backfill).toHaveBeenCalledOnce();
  });
  it("401s when neither index nor bcrypt matches", async () => {
    const result = await verifier(stubStore()).verify(
      parseAuthorizationHeader(basicHeader("pk-lf-1", "sk")),
    );
    expect(result.success).toBe(false);
  });
});

describe("Bearer chains admin then private then public", () => {
  it("resolves the admin key first", async () => {
    const result = await verifier(stubStore()).verify(
      parseAuthorizationHeader(`Bearer ${ADMIN}`),
    );
    expect(result).toMatchObject({ success: true, authorization: "admin" });
  });
  it("private-first: a token matching the fast hash is privateKey", async () => {
    const key = apiKey();
    const findByPublicKey = vi.fn(async () => lookup(key));
    const store = stubStore({
      findByFastHash: vi.fn(async () => lookup(key)),
      findByPublicKey,
    });
    const result = await verifier(store).verify(
      parseAuthorizationHeader("Bearer sk-secret"),
    );
    expect(result).toMatchObject({
      success: true,
      authorization: "privateKey",
    });
    expect(findByPublicKey).not.toHaveBeenCalled();
  });
  it("falls to publicKey when no fast hash matches", async () => {
    const key = apiKey();
    const store = stubStore({
      findByPublicKey: vi.fn(async () => lookup(key)),
    });
    const result = await verifier(store).verify(
      parseAuthorizationHeader("Bearer pk-lf-1"),
    );
    expect(result).toMatchObject({
      success: true,
      authorization: "publicKey",
      apiKey: key,
    });
  });
  it("a NULL-hash key is Basic-only, not Bearer-private", async () => {
    const key = apiKey({ fastHashedSecretKey: null });
    const store = stubStore({
      findByFastHash: vi.fn(async () => lookup(key)),
      findByPublicKey: vi.fn(async () => lookup(null)),
    });
    const result = await verifier(store).verify(
      parseAuthorizationHeader("Bearer sk-secret"),
    );
    expect(result.success).toBe(false);
  });
});

describe("admin key needs a set, non-empty configured key", () => {
  it("is ignored when the configured key is unset", async () => {
    const noKey = new Verifier(stubStore(), SALT, undefined);
    const result = await noKey.verify(parseAuthorizationHeader("Bearer "));
    expect(result.success).toBe(false);
  });
  it("is ignored when the configured key is whitespace only", async () => {
    const blankKey = new Verifier(stubStore(), SALT, "   ");
    const result = await blankKey.verify(
      parseAuthorizationHeader("Bearer    "),
    );
    expect(result.success).toBe(false);
  });
});

describe("infra failures surface as typed errors, not throws", () => {
  it("propagates an api key repo failure as an InternalServerError result", async () => {
    const store = stubStore({
      findByFastHash: vi.fn(
        async (): Promise<FindApiKeyResult> => ({
          success: false,
          error: new InternalServerError("db down"),
        }),
      ),
    });
    const result = await verifier(store).verify(
      parseAuthorizationHeader(basicHeader("pk-lf-1", "sk")),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBeInstanceOf(InternalServerError);
  });
});
