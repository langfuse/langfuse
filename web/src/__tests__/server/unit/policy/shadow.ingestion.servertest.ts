import { type NextApiRequest } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError } from "@langfuse/shared";
import { eventTypes } from "@langfuse/shared/src/server";

import { type AuthorizationContext } from "@/src/features/auth/policy/types";

const { env, mockVerifyScope, mockShadowAuth, mockAuthorize } = vi.hoisted(
  () => ({
    env: { API_AUTH_MIGRATION: "legacy" as string },
    mockVerifyScope: vi.fn(),
    mockShadowAuth: vi.fn(),
    mockAuthorize: vi.fn(),
  }),
);

vi.mock("@/src/env.mjs", () => ({ env }));

vi.mock("@/src/features/public-api/server/apiAuth", () => ({
  ApiAuthService: class {
    verifyAuthHeaderAndReturnScope = mockVerifyScope;
  },
}));

vi.mock("@/src/features/public-api/server/shadowAuth", () => ({
  shadowAuth: mockShadowAuth,
}));

vi.mock("@/src/features/auth/policy/authorize", () => ({
  authorize: mockAuthorize,
}));

import {
  authorizeIngestionEvents,
  verifyIngestionAuth,
} from "@/src/features/auth/policy/shadow.ingestion";

const context = {
  principal: { kind: "admin", userId: null },
  policies: [],
} as AuthorizationContext;

describe("ingestion whole-request seam verifyIngestionAuth", () => {
  const req = { headers: {}, method: "POST" } as unknown as NextApiRequest;
  const validScope = {
    projectId: "prj_1",
    accessLevel: "project",
    isIngestionSuspended: false,
  };

  const legacyValid = () =>
    mockVerifyScope.mockResolvedValue({ validKey: true, scope: validScope });

  beforeEach(() => {
    vi.clearAllMocks();
    env.API_AUTH_MIGRATION = "legacy";
  });

  describe("legacy mode never runs the policy core", () => {
    it("returns the legacy scope without a context", async () => {
      legacyValid();
      const result = await verifyIngestionAuth({ req });
      expect(result).toMatchObject({ ok: true, projectId: "prj_1" });
      expect(result.ok && result.context).toBeUndefined();
      expect(mockShadowAuth).not.toHaveBeenCalled();
    });

    it("returns a 401 for an invalid credential", async () => {
      mockVerifyScope.mockResolvedValue({ validKey: false, error: "bad key" });
      const result = await verifyIngestionAuth({ req });
      expect(result.ok).toBe(false);
    });

    it("returns a 401 for an organization key with no project scope", async () => {
      mockVerifyScope.mockResolvedValue({
        validKey: true,
        scope: { ...validScope, projectId: null },
      });
      const result = await verifyIngestionAuth({ req });
      expect(result.ok).toBe(false);
    });

    it("returns a 403 with the target project for a suspended org", async () => {
      mockVerifyScope.mockResolvedValue({
        validKey: true,
        scope: { ...validScope, isIngestionSuspended: true },
      });
      const result = await verifyIngestionAuth({ req });
      expect(result).toMatchObject({
        ok: false,
        error: expect.any(ForbiddenError),
        projectId: "prj_1",
      });
    });
  });

  describe("shadow mode keeps the legacy scope and attaches no context", () => {
    beforeEach(() => {
      env.API_AUTH_MIGRATION = "shadow";
    });

    it("runs shadowAuth for parity and returns the legacy scope", async () => {
      legacyValid();
      mockShadowAuth.mockResolvedValue({ success: true, scope: {} });
      const result = await verifyIngestionAuth({ req });
      expect(mockShadowAuth).toHaveBeenCalled();
      expect(result).toMatchObject({ ok: true, projectId: "prj_1" });
      expect(result.ok && result.context).toBeUndefined();
    });

    it("stays byte-identical when the policy core denies", async () => {
      legacyValid();
      mockShadowAuth.mockResolvedValue({
        success: false,
        error: new ForbiddenError("nope"),
      });
      const result = await verifyIngestionAuth({ req });
      expect(result.ok).toBe(true);
    });
  });

  describe("enforce mode lets the policy core decide", () => {
    beforeEach(() => {
      env.API_AUTH_MIGRATION = "enforce";
    });

    it("passes through with the resolved context when the policy core allows", async () => {
      legacyValid();
      mockShadowAuth.mockResolvedValue({
        success: true,
        scope: {},
        ctx: context,
      });
      const result = await verifyIngestionAuth({ req });
      expect(result).toMatchObject({ ok: true, projectId: "prj_1", context });
    });

    it("blocks with the policy core's error and the target project", async () => {
      legacyValid();
      const error = new ForbiddenError("nope");
      mockShadowAuth.mockResolvedValue({ success: false, error });
      const result = await verifyIngestionAuth({ req });
      expect(result).toMatchObject({ ok: false, error, projectId: "prj_1" });
    });
  });
});

describe("ingestion per-event seam authorizeIngestionEvents", () => {
  const scoreEvent = { id: "e_score", type: eventTypes.SCORE_CREATE };
  const traceEvent = { id: "e_trace", type: eventTypes.TRACE_CREATE };
  const logEvent = { id: "e_log", type: eventTypes.SDK_LOG };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("drops denied events as 207 rejections and keeps permitted ones", () => {
    mockAuthorize.mockImplementation((_ctx, action: string) =>
      action === "scores:create"
        ? { success: true }
        : { success: false, error: new ForbiddenError("nope") },
    );
    const result = authorizeIngestionEvents({
      batch: [scoreEvent, traceEvent],
      context,
      projectId: "prj_1",
    });
    expect(result.batchForProcessing).toEqual([scoreEvent]);
    expect(result.rejectedErrors).toEqual([
      {
        id: "e_trace",
        status: 401,
        message: "Authentication error",
        error: "Access Scope Denied",
      },
    ]);
  });

  it("passes SDK logs through without asserting an action", () => {
    const result = authorizeIngestionEvents({
      batch: [logEvent],
      context,
      projectId: "prj_1",
    });
    expect(result.batchForProcessing).toEqual([logEvent]);
    expect(mockAuthorize).not.toHaveBeenCalled();
  });
});
