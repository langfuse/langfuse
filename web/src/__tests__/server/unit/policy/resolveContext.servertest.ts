import { describe, expect, it } from "vitest";

import { type ApiKey } from "@langfuse/shared/src/db";

import { authorize } from "@/src/features/auth/policy/authorize";
import { resolveContext } from "@/src/features/auth/policy/resolveContext";
import { type PrincipalOrganization } from "@/src/features/auth/policy/types";

const ORG = "org_1";
const PRJ = "prj_1";
const OTHER_PRJ = "prj_2";
const USER = "user_1";

const organization = (
  over: Partial<PrincipalOrganization> = {},
): PrincipalOrganization => ({
  orgId: ORG,
  plan: "cloud:hobby",
  rateLimitConfig: [],
  projectIds: [PRJ, OTHER_PRJ],
  isIngestionSuspended: false,
  ...over,
});

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
  it("grants admin over any project and org", () => {
    const { context: ctx } = resolveContext({ authorization: "adminKey" });
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
  it("the same row is full-access under privateKey and scores-only under publicKey", () => {
    const { context: priv } = resolveContext({
      authorization: "privateKey",
      apiKey: apiKey(),
      organization: organization(),
    });
    const { context: pub } = resolveContext({
      authorization: "publicKey",
      apiKey: apiKey(),
      organization: organization(),
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
  it("grants the full project vocabulary over the bound project only", () => {
    const { context: ctx } = resolveContext({
      authorization: "privateKey",
      apiKey: apiKey(),
      organization: organization(),
    });
    expect(authorize(ctx, "prompts:read", { projectId: PRJ }).success).toBe(
      true,
    );
    expect(
      authorize(ctx, "prompts:read", { projectId: OTHER_PRJ }).success,
    ).toBe(false);
  });
  it("does not satisfy org-level actions", () => {
    const { context: ctx } = resolveContext({
      authorization: "privateKey",
      apiKey: apiKey(),
      organization: organization(),
    });
    expect(authorize(ctx, "project:read", { orgId: ORG }).success).toBe(false);
  });
});

describe("expansion table: scope ORGANIZATION, privateKey", () => {
  it("grants the full org vocabulary and project:read across org projects", () => {
    const { context: ctx } = resolveContext({
      authorization: "privateKey",
      apiKey: orgKey(),
      organization: organization(),
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
  it("carries createdByUserId to principal.userId", () => {
    const { context: ctx } = resolveContext({
      authorization: "privateKey",
      apiKey: apiKey(),
      organization: organization(),
    });
    expect(ctx.principal.kind === "apiKey" && ctx.principal.userId).toBe(USER);
  });
});

describe("org suspension rides as a boolean, not a policy", () => {
  it("carries isIngestionSuspended while the PDP still grants creation", () => {
    const { context: ctx } = resolveContext({
      authorization: "privateKey",
      apiKey: apiKey(),
      organization: organization({ isIngestionSuspended: true }),
    });
    const org =
      ctx.principal.kind === "apiKey" ? ctx.principal.organizations[0] : null;
    expect(org?.isIngestionSuspended).toBe(true);
    expect(authorize(ctx, "traces:create", { projectId: PRJ }).success).toBe(
      true,
    );
  });
});
