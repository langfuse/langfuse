import { describe, expect, it, vi } from "vitest";

import { type ApiKey } from "@langfuse/shared/src/db";

import { authorize } from "@/src/features/auth/policy/authorize";
import {
  ContextResolver,
  defaultContextResolver,
  __test,
  type OrgEnrichment,
  type ResolveContextResult,
} from "@/src/features/auth/policy/resolveContext";
import { type AuthorizationContext } from "@/src/features/auth/policy/types";

const { createContextCache } = __test;

const ORG = "org_1";
const PRJ = "prj_1";
const OTHER_PRJ = "prj_2";
const USER = "user_1";

const enrichment = (over: Partial<OrgEnrichment> = {}): OrgEnrichment => ({
  orgId: ORG,
  plan: "cloud:hobby",
  rateLimitConfig: [],
  projectIds: [PRJ, OTHER_PRJ],
  isIngestionSuspended: false,
  ...over,
});
const makeResolver = (
  over: Partial<OrgEnrichment> = {},
): { resolver: ContextResolver; enrich: ReturnType<typeof vi.fn> } => {
  const enrich = vi.fn(async () => enrichment(over));
  return {
    resolver: new ContextResolver({ enrich }, createContextCache()),
    enrich,
  };
};
const contextOf = (result: ResolveContextResult): AuthorizationContext => {
  if (!result.success) throw result.error;
  return result.context;
};

const apiKey = (over: Partial<ApiKey> = {}): ApiKey => ({
  id: "key_p",
  createdAt: new Date(0),
  note: null,
  publicKey: "pk-lf-1",
  hashedSecretKey: "hsk",
  fastHashedSecretKey: "fhsk",
  displaySecretKey: "sk-...abc",
  lastUsedAt: null,
  expiresAt: null,
  isInAppAgentKey: false,
  projectId: PRJ,
  orgId: ORG,
  scope: "PROJECT",
  createdByUserId: USER,
  createdByApiKeyId: null,
  ...over,
});
const orgKey = (over: Partial<ApiKey> = {}): ApiKey =>
  apiKey({ id: "key_o", scope: "ORGANIZATION", projectId: null, ...over });

describe("default resolver resolves the admin key with no collaborators", () => {
  it("grants admin over any project and org", async () => {
    const ctx = contextOf(
      await defaultContextResolver.resolveContext({
        authorization: "adminKey",
      }),
    );
    expect(ctx.principal.kind).toBe("admin");
    expect(authorize(ctx, "prompts:read", { projectId: "any" }).success).toBe(
      true,
    );
    expect(authorize(ctx, "projects:create", { orgId: "any" }).success).toBe(
      true,
    );
  });
});

describe("presentation rides in the input", () => {
  it("the same row is full-access under privateKey and scores-only under publicKey", async () => {
    const { resolver } = makeResolver();
    const priv = contextOf(
      await resolver.resolveContext({
        authorization: "privateKey",
        apiKey: apiKey(),
      }),
    );
    const pub = contextOf(
      await resolver.resolveContext({
        authorization: "publicKey",
        apiKey: apiKey(),
      }),
    );
    expect(authorize(priv, "traces:read", { projectId: PRJ }).success).toBe(
      true,
    );
    expect(authorize(pub, "scores:create", { projectId: PRJ }).success).toBe(
      true,
    );
    expect(authorize(pub, "traces:read", { projectId: PRJ }).success).toBe(
      false,
    );
  });
});

describe("resolver cache", () => {
  it("materializes once per (key, presentation), then serves from cache", async () => {
    const { resolver, enrich } = makeResolver();
    await resolver.resolveContext({
      authorization: "privateKey",
      apiKey: apiKey(),
    });
    await resolver.resolveContext({
      authorization: "privateKey",
      apiKey: apiKey(),
    });
    expect(enrich).toHaveBeenCalledTimes(1);
  });
  it("caches presentations separately", async () => {
    const { resolver, enrich } = makeResolver();
    await resolver.resolveContext({
      authorization: "privateKey",
      apiKey: apiKey(),
    });
    await resolver.resolveContext({
      authorization: "publicKey",
      apiKey: apiKey(),
    });
    expect(enrich).toHaveBeenCalledTimes(2);
  });
});

describe("invalidate evicts the resolver cache", () => {
  it("invalidate({ apiKeyId }) forces the next resolve to re-materialize", async () => {
    const { resolver, enrich } = makeResolver();
    await resolver.resolveContext({
      authorization: "privateKey",
      apiKey: apiKey(),
    });
    await resolver.invalidate({ apiKeyId: "key_p" });
    await resolver.resolveContext({
      authorization: "privateKey",
      apiKey: apiKey(),
    });
    expect(enrich).toHaveBeenCalledTimes(2);
  });
  it("invalidate({ orgId }) evicts every key under the org", async () => {
    const { resolver, enrich } = makeResolver();
    await resolver.resolveContext({
      authorization: "privateKey",
      apiKey: apiKey(),
    });
    await resolver.invalidate({ orgId: ORG });
    await resolver.resolveContext({
      authorization: "privateKey",
      apiKey: apiKey(),
    });
    expect(enrich).toHaveBeenCalledTimes(2);
  });
});

describe("expansion table: scope PROJECT, privateKey", () => {
  it("grants the full project vocabulary over the bound project only", async () => {
    const ctx = contextOf(
      await makeResolver().resolver.resolveContext({
        authorization: "privateKey",
        apiKey: apiKey(),
      }),
    );
    expect(authorize(ctx, "prompts:read", { projectId: PRJ }).success).toBe(
      true,
    );
    expect(
      authorize(ctx, "prompts:read", { projectId: OTHER_PRJ }).success,
    ).toBe(false);
  });
  it("does not satisfy org-level actions", async () => {
    const ctx = contextOf(
      await makeResolver().resolver.resolveContext({
        authorization: "privateKey",
        apiKey: apiKey(),
      }),
    );
    expect(authorize(ctx, "project:read", { orgId: ORG }).success).toBe(false);
  });
});

describe("expansion table: scope ORGANIZATION, privateKey", () => {
  it("grants the full org vocabulary and project:read across org projects", async () => {
    const ctx = contextOf(
      await makeResolver().resolver.resolveContext({
        authorization: "privateKey",
        apiKey: orgKey(),
      }),
    );
    expect(authorize(ctx, "project:read", { projectId: PRJ }).success).toBe(
      true,
    );
    expect(authorize(ctx, "traces:read", { projectId: PRJ }).success).toBe(
      false,
    );
  });
});

describe("attribution", () => {
  it("carries createdByUserId to principal.userId", async () => {
    const ctx = contextOf(
      await makeResolver().resolver.resolveContext({
        authorization: "privateKey",
        apiKey: apiKey(),
      }),
    );
    expect(ctx.principal.kind === "apiKey" && ctx.principal.userId).toBe(USER);
  });
});

describe("org suspension rides as a boolean, not a policy", () => {
  it("carries isIngestionSuspended while the PDP still grants creation", async () => {
    const ctx = contextOf(
      await makeResolver({
        isIngestionSuspended: true,
      }).resolver.resolveContext({
        authorization: "privateKey",
        apiKey: apiKey(),
      }),
    );
    const org =
      ctx.principal.kind === "apiKey" ? ctx.principal.organizations[0] : null;
    expect(org?.isIngestionSuspended).toBe(true);
    expect(authorize(ctx, "traces:create", { projectId: PRJ }).success).toBe(
      true,
    );
  });
});
