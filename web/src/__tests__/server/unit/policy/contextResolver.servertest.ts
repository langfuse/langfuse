import { describe, expect, it } from "vitest";

import { type ApiKey, type PrismaClient } from "@langfuse/shared/src/db";
import { InternalServerError } from "@langfuse/shared";

import { authorize } from "@/src/features/auth/policy/authorize";
import {
  OrganizationRepository,
  type OrganizationWithProjects,
} from "@/src/features/auth/policy/organizationRepository";
import {
  ContextResolver,
  type ResolveContextParams,
} from "@/src/features/auth/policy/contextResolver";
import { type AuthorizationContext } from "@/src/features/auth/policy/types";

const ORG = "org_1";
const PRJ = "prj_1";
const OTHER_PRJ = "prj_2";
const USER = "user_1";

const orgRow = (
  over: Partial<OrganizationWithProjects> = {},
): OrganizationWithProjects =>
  ({
    id: ORG,
    cloudConfig: null,
    cloudFreeTierUsageThresholdState: null,
    projects: [{ id: PRJ }, { id: OTHER_PRJ }],
    ...over,
  }) as unknown as OrganizationWithProjects;

const resolverFor = (row: OrganizationWithProjects | null): ContextResolver =>
  new ContextResolver(
    new OrganizationRepository({
      organization: { findUnique: async () => row },
    } as unknown as PrismaClient),
  );

const contextFor = async (
  params: ResolveContextParams,
  row: OrganizationWithProjects | null = orgRow(),
): Promise<AuthorizationContext> => {
  const resolved = await resolverFor(row).resolve(params);
  if (!resolved.success) throw resolved.error;
  return resolved.context;
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

describe("resolves the admin key", () => {
  it("grants admin over any project and org", async () => {
    const ctx = await contextFor({ authorization: "admin" });
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
    const priv = await contextFor({
      authorization: "privateKey",
      apiKey: apiKey(),
    });
    const pub = await contextFor({
      authorization: "publicKey",
      apiKey: apiKey(),
    });
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

describe("expansion table: scope PROJECT, privateKey", () => {
  it("grants the full project vocabulary over the bound project only", async () => {
    const ctx = await contextFor({
      authorization: "privateKey",
      apiKey: apiKey(),
    });
    expect(authorize(ctx, "prompts:read", { projectId: PRJ }).success).toBe(
      true,
    );
    expect(
      authorize(ctx, "prompts:read", { projectId: OTHER_PRJ }).success,
    ).toBe(false);
  });
  it("does not satisfy org-level actions", async () => {
    const ctx = await contextFor({
      authorization: "privateKey",
      apiKey: apiKey(),
    });
    expect(authorize(ctx, "project:read", { orgId: ORG }).success).toBe(false);
  });
});

describe("expansion table: scope ORGANIZATION, privateKey", () => {
  it("grants the full org vocabulary and project:read across org projects", async () => {
    const ctx = await contextFor({
      authorization: "privateKey",
      apiKey: orgKey(),
    });
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
    const ctx = await contextFor({
      authorization: "privateKey",
      apiKey: apiKey(),
    });
    expect(ctx.principal.kind === "apiKey" && ctx.principal.userId).toBe(USER);
  });

  it("apiKey principal: carries isInAppAgentKey", async () => {
    const ctx = await contextFor({
      authorization: "privateKey",
      apiKey: apiKey({ isInAppAgentKey: true }),
    });
    expect(
      ctx.principal.kind === "apiKey" && ctx.principal.isInAppAgentKey,
    ).toBe(true);
  });
});

describe("org suspension rides as a boolean, not a policy", () => {
  it("carries isIngestionSuspended while the PDP still grants creation", async () => {
    const ctx = await contextFor(
      { authorization: "privateKey", apiKey: apiKey() },
      orgRow({ cloudFreeTierUsageThresholdState: "BLOCKED" }),
    );
    const org =
      ctx.principal.kind === "apiKey" ? ctx.principal.organizations[0] : null;
    expect(org?.isIngestionSuspended).toBe(true);
    expect(authorize(ctx, "traces:create", { projectId: PRJ }).success).toBe(
      true,
    );
  });
});

describe("a verified key with no org is a 500 invariant break", () => {
  it("collapses a missing org to an InternalServerError", async () => {
    const resolved = await resolverFor(null).resolve({
      authorization: "privateKey",
      apiKey: apiKey(),
    });
    expect(resolved.success).toBe(false);
    if (!resolved.success) {
      expect(resolved.error).toBeInstanceOf(InternalServerError);
    }
  });

  it("collapses a key with a null orgId to an InternalServerError", async () => {
    const resolved = await resolverFor(orgRow()).resolve({
      authorization: "privateKey",
      apiKey: apiKey({ orgId: null }),
    });
    expect(resolved.success).toBe(false);
    if (!resolved.success) {
      expect(resolved.error).toBeInstanceOf(InternalServerError);
    }
  });
});
