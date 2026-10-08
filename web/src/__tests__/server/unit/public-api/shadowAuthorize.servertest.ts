import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthorizedError } from "@langfuse/shared";
import {
  OrganizationId,
  ProjectId,
  SystemRoleId,
  type ProjectAction,
} from "@langfuse/shared/rbac";

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
import { type Prisma } from "@langfuse/shared/src/db";
import { authorizeProtectedLabelMutation } from "@/src/features/prompts/server/utils/authorizeProtectedLabelMutation";
import { type Policy } from "@/src/features/rbac/types";
import { type AuthorizationContext } from "@/src/features/auth/policy/types";

const PRJ = "prj_1";
const ORG = "org_1";

const allowPrompts: Policy = {
  id: "system/LEGACY_PROJECT_API_KEY:project",
  tenantId: OrganizationId(ORG),
  roleId: SystemRoleId("LEGACY_PROJECT_API_KEY"),
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
  legacyDecision: {
    success: true as const,
    scope: { accessLevel: "project" as const },
  },
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

  it.each(["legacy", "shadow"])("passes without context in %s", (mode) => {
    env.API_AUTH_MIGRATION = mode;
    expect(shadowAuthorize(params("prompts:CUD", undefined))).toEqual({
      success: true,
      scope: { accessLevel: "project" },
    });
  });

  it.each([
    ["legacy", undefined],
    ["shadow", undefined],
    ["shadow", authContext([allowPrompts])],
  ] as const)(
    "preserves a legacy denial in %s with context %j",
    (mode, ctx) => {
      env.API_AUTH_MIGRATION = mode;
      const legacyDecision = {
        success: false as const,
        error: new UnauthorizedError("Access Scope Denied"),
      };
      expect(
        shadowAuthorize({ ...params("prompts:read", ctx), legacyDecision }),
      ).toEqual(legacyDecision);
    },
  );

  it("denies a gated item without context in enforce", () => {
    expect(shadowAuthorize(params("prompts:CUD", undefined))).toMatchObject({
      success: false,
      error: expect.any(UnauthorizedError),
    });
  });

  it("allows an explicit opt-out without context in enforce", () => {
    expect(shadowAuthorize(params(__dangerouslySkipAuthz, undefined))).toEqual({
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
      expect(decision).toEqual({
        success: true,
        scope: { accessLevel: "project" },
      });
      expect(shadowAuthDiff).toHaveBeenCalledWith(
        { success: false, error: expect.any(ForbiddenError) },
        { success: true, scope: { accessLevel: "project" } },
        "prompts:CUD",
      );
    });

    it.each(["prompts:read", "prompts:CUD"] as const)(
      "compares %s against an actual legacy denial without changing the outcome",
      (action) => {
        const legacyDecision = {
          success: false as const,
          error: new ForbiddenError("Creator cannot mutate protected labels"),
        };
        expect(
          shadowAuthorize({
            ...params(action, authContext([allowPrompts])),
            legacyDecision,
          }),
        ).toEqual(legacyDecision);
        expect(shadowAuthDiff).toHaveBeenCalledWith(
          action === "prompts:read"
            ? { success: true }
            : { success: false, error: expect.any(ForbiddenError) },
          legacyDecision,
          action,
        );
      },
    );

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

describe("protected-label legacy comparisons", () => {
  beforeEach(() => {
    env.API_AUTH_MIGRATION = "shadow";
    shadowAuthDiff.mockClear();
  });

  const setup = () => {
    const findApiKey = vi.fn().mockResolvedValue({
      isInAppAgentKey: true,
      createdByUserId: "missing-user",
    });
    return {
      findApiKey,
      params: {
        prisma: {
          promptProtectedLabels: {
            findMany: vi.fn().mockResolvedValue([{ label: "production" }]),
          },
          apiKey: { findUnique: findApiKey },
          user: { findUnique: vi.fn().mockResolvedValue(null) },
        } as unknown as Prisma.TransactionClient,
        context: {
          projectId: PRJ,
          orgId: ORG,
          apiKeyId: "key_1",
          accessLevel: "project" as const,
        },
        ctx: authContext([
          { ...allowPrompts, actions: ["promptProtectedLabels:CUD"] },
        ]),
        labelsToCheck: ["production"],
        forbiddenErrorMessage: "Cannot change protected labels",
      },
    };
  };

  it.each(["legacy", "shadow"])(
    "preserves creator denial in %s and compares the real shadow baseline",
    async (mode) => {
      env.API_AUTH_MIGRATION = mode;
      const { params } = setup();
      await expect(
        authorizeProtectedLabelMutation(params),
      ).rejects.toMatchObject({
        httpCode: 403,
        message:
          "Cannot change protected labels\n\n Protected labels are: production",
      });
      if (mode === "shadow") {
        expect(shadowAuthDiff).toHaveBeenCalledWith(
          { success: true },
          { success: false, error: expect.any(ForbiddenError) },
          "promptProtectedLabels:CUD",
        );
      } else {
        expect(shadowAuthDiff).not.toHaveBeenCalled();
      }
    },
  );

  it("preserves a shadow creator denial without a resolved context", async () => {
    const { params } = setup();
    await expect(
      authorizeProtectedLabelMutation({ ...params, ctx: undefined }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(shadowAuthDiff).not.toHaveBeenCalled();
  });

  it("compares an ordinary key's allow without repeating the lookup", async () => {
    const { params, findApiKey } = setup();
    findApiKey.mockResolvedValueOnce({ isInAppAgentKey: false });
    await expect(
      authorizeProtectedLabelMutation(params),
    ).resolves.toBeUndefined();
    expect(findApiKey).toHaveBeenCalledTimes(1);
    expect(shadowAuthDiff).toHaveBeenCalledWith(
      { success: true },
      { success: true, scope: { accessLevel: "project" } },
      "promptProtectedLabels:CUD",
    );
  });

  it("keeps the enforce decision ahead of creator lookups", async () => {
    env.API_AUTH_MIGRATION = "enforce";
    const { params, findApiKey } = setup();
    await expect(
      authorizeProtectedLabelMutation({
        ...params,
        ctx: authContext([]),
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(findApiKey).not.toHaveBeenCalled();
  });

  it("propagates creator lookup failures without reporting an auth denial", async () => {
    const { params, findApiKey } = setup();
    const error = new Error("database unavailable");
    findApiKey.mockRejectedValueOnce(error);
    await expect(authorizeProtectedLabelMutation(params)).rejects.toBe(error);
    expect(shadowAuthDiff).not.toHaveBeenCalled();
  });
});
