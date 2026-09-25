import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError } from "@langfuse/shared";
import { OrganizationId, ProjectId, SystemRoleId } from "@langfuse/shared/rbac";

const { env } = vi.hoisted(() => ({
  env: { API_AUTH_MIGRATION: "enforce" as string },
}));

vi.mock("@/src/env.mjs", () => ({ env }));

const { shadowAuthDiff } = vi.hoisted(() => ({ shadowAuthDiff: vi.fn() }));

vi.mock("@/src/features/public-api/server/shadowAuthDiff", () => ({
  shadowAuthDiff,
}));

import {
  shadowAuthorize,
  __dangerouslySkipAuthz,
  type ApiAction,
} from "@/src/features/public-api/server";
import { type Policy, type ProjectAction } from "@/src/features/rbac/types";
import { type AuthorizationContext } from "@/src/features/auth/policy/types";

const PRJ = "prj_1";
const ORG = "org_1";

const allowPrompts: Policy = {
  id: "system/PROJECT:project",
  tenantId: OrganizationId(ORG),
  roleId: SystemRoleId("PROJECT"),
  actions: ["prompts:read"] as ProjectAction[] as never,
  resources: [ProjectId(PRJ)],
  effect: "ALLOW",
};

const authContext = (policies: Policy[]): AuthorizationContext => ({
  principal: {
    kind: "apiKey",
    apiKeyId: "key_1",
    userId: null,
    isInAppAgentKey: false,
    publicKey: "pk-lf-1",
    scope: "PROJECT",
    presentation: "privateKey",
    organizations: [],
    boundResource: { orgId: "org_1", projectId: PRJ },
  },
  policies,
});

const params = (action: ApiAction, ctx: AuthorizationContext | undefined) => ({
  ctx,
  action,
  resource: { projectId: PRJ },
  accessLevel: "project" as const,
});

describe("shadowAuthorize", () => {
  beforeEach(() => {
    env.API_AUTH_MIGRATION = "enforce";
    shadowAuthDiff.mockClear();
  });

  it("denies when the context lacks the item's action", () => {
    const decision = shadowAuthorize(
      params("prompts:CUD", authContext([allowPrompts])),
    );
    expect(decision).toMatchObject({
      success: false,
      error: expect.any(ForbiddenError),
    });
  });

  it("allows when the context holds the item's action", () => {
    expect(
      shadowAuthorize(params("prompts:read", authContext([allowPrompts]))),
    ).toEqual({ success: true });
  });

  it("passes an ungated item", () => {
    expect(
      shadowAuthorize(params(__dangerouslySkipAuthz, authContext([]))),
    ).toEqual({
      success: true,
    });
  });

  it("passes when no context resolved (legacy)", () => {
    expect(shadowAuthorize(params("prompts:CUD", undefined))).toEqual({
      success: true,
    });
  });

  describe("shadow mode", () => {
    beforeEach(() => {
      env.API_AUTH_MIGRATION = "shadow";
    });

    it("diffs a denied item against legacy's implicit allow without denying", () => {
      const decision = shadowAuthorize(
        params("prompts:CUD", authContext([allowPrompts])),
      );
      expect(decision).toEqual({ success: true });
      expect(shadowAuthDiff).toHaveBeenCalledWith(
        { success: false, error: expect.any(ForbiddenError) },
        { success: true, scope: { accessLevel: "project" } },
        "prompts:CUD",
      );
    });

    it("diffs an allowed item", () => {
      shadowAuthorize(params("prompts:read", authContext([allowPrompts])));
      expect(shadowAuthDiff).toHaveBeenCalledWith(
        { success: true },
        { success: true, scope: { accessLevel: "project" } },
        "prompts:read",
      );
    });
  });
});
