import { type NextApiRequest } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError } from "@langfuse/shared";
import { eventTypes } from "@langfuse/shared/src/server";

import { type AuthorizationContext } from "@/src/features/auth/policy/types";

const {
  env,
  mockVerifyScope,
  mockEnforceIngestionAuth,
  mockAuthorizeIngestionEvent,
  mockDiffResults,
  mockRecordCoverage,
} = vi.hoisted(() => ({
  env: { PUBLIC_API_AUTHZ_MIGRATION: "legacy" as string },
  mockVerifyScope: vi.fn(),
  mockEnforceIngestionAuth: vi.fn(),
  mockAuthorizeIngestionEvent: vi.fn(),
  mockDiffResults: vi.fn(),
  mockRecordCoverage: vi.fn(),
}));

vi.mock("@/src/env.mjs", () => ({ env }));

vi.mock("@/src/features/public-api/server/apiAuth", () => ({
  ApiAuthService: class {
    verifyAuthHeaderAndReturnScope = mockVerifyScope;
  },
}));

vi.mock(
  "@/src/features/auth/policy/enforcement.ingestion",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    enforceIngestionAuth: mockEnforceIngestionAuth,
    authorizeIngestionEvent: mockAuthorizeIngestionEvent,
  }),
);

vi.mock("@/src/features/auth/policy/shadow", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  diffResults: mockDiffResults,
  recordCoverage: mockRecordCoverage,
}));

import {
  __test,
  authorizeIngestionEvents,
  verifyIngestionAuth,
} from "@/src/features/auth/policy/shadow.ingestion";

const context: AuthorizationContext = {
  principal: {
    kind: "apiKey",
    apiKeyId: "key_1",
    userId: null,
    organizations: [],
    boundResource: { projectId: "prj_1" },
  },
  policies: [],
};

describe("ingestion whole-request seam verifyIngestionAuth", () => {
  const req = { headers: {}, method: "POST" } as unknown as NextApiRequest;
  const validScope = {
    projectId: "prj_1",
    accessLevel: "project",
    isIngestionSuspended: false,
  };

  const legacyValid = () =>
    mockVerifyScope.mockResolvedValue({ validKey: true, scope: validScope });
  const legacyInvalid = () =>
    mockVerifyScope.mockResolvedValue({ validKey: false, error: "bad key" });

  beforeEach(() => {
    vi.clearAllMocks();
    env.PUBLIC_API_AUTHZ_MIGRATION = "legacy";
  });

  describe("legacy mode never runs the new pipeline", () => {
    it("returns the legacy scope without a context", async () => {
      legacyValid();
      const result = await verifyIngestionAuth({ req });
      expect(result).toMatchObject({ ok: true, projectId: "prj_1" });
      expect(result.ok && result.context).toBeUndefined();
      expect(mockEnforceIngestionAuth).not.toHaveBeenCalled();
    });

    it("returns a 401 for an invalid credential", async () => {
      legacyInvalid();
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

  describe("shadow mode keeps responses byte-identical to legacy", () => {
    beforeEach(() => {
      env.PUBLIC_API_AUTHZ_MIGRATION = "shadow";
    });

    it("records the parity cell and coverage counter", async () => {
      legacyValid();
      mockEnforceIngestionAuth.mockResolvedValue({ success: true, context });
      await verifyIngestionAuth({ req });
      expect(mockRecordCoverage).toHaveBeenCalledWith("ingestion");
      expect(mockDiffResults).toHaveBeenCalledWith(
        { success: true, context },
        { ok: true },
        { seam: "ingestion_event", action: "ingestion:write" },
      );
    });

    it("returns the legacy scope plus the resolved context", async () => {
      legacyValid();
      mockEnforceIngestionAuth.mockResolvedValue({ success: true, context });
      const result = await verifyIngestionAuth({ req });
      expect(result).toMatchObject({ ok: true, context });
    });

    it("stays byte-identical when the new pipeline denies", async () => {
      legacyValid();
      mockEnforceIngestionAuth.mockResolvedValue({
        success: false,
        error: new ForbiddenError("nope"),
      });
      const result = await verifyIngestionAuth({ req });
      expect(result.ok).toBe(true);
    });
  });

  describe("enforce mode lets the new pipeline decide", () => {
    beforeEach(() => {
      env.PUBLIC_API_AUTHZ_MIGRATION = "enforce";
    });

    it("403s a suspended org with today's message", async () => {
      legacyValid();
      const error = new ForbiddenError(
        "Ingestion suspended: Usage threshold exceeded. Please upgrade your plan.",
      );
      mockEnforceIngestionAuth.mockResolvedValue({ success: false, error });
      const result = await verifyIngestionAuth({ req });
      expect(result).toMatchObject({ ok: false, error, projectId: "prj_1" });
    });

    it("passes through with the resolved context when the new pipeline allows", async () => {
      legacyValid();
      mockEnforceIngestionAuth.mockResolvedValue({ success: true, context });
      const result = await verifyIngestionAuth({ req });
      expect(result).toMatchObject({ ok: true, projectId: "prj_1", context });
    });

    it("does not record parity telemetry", async () => {
      legacyValid();
      mockEnforceIngestionAuth.mockResolvedValue({ success: true, context });
      await verifyIngestionAuth({ req });
      expect(mockDiffResults).not.toHaveBeenCalled();
      expect(mockRecordCoverage).not.toHaveBeenCalled();
    });
  });
});

describe("ingestion per-event seam authorizeIngestionEvents", () => {
  const scoreEvent = { id: "e_score", type: eventTypes.SCORE_CREATE };
  const traceEvent = { id: "e_trace", type: eventTypes.TRACE_CREATE };

  const allow = () => ({ success: true });
  const deny = () => ({ success: false, error: new ForbiddenError("nope") });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the whole batch and records per-event parity in shadow mode", () => {
    env.PUBLIC_API_AUTHZ_MIGRATION = "shadow";
    mockAuthorizeIngestionEvent.mockReturnValueOnce(allow());
    mockAuthorizeIngestionEvent.mockReturnValueOnce(deny());
    const result = authorizeIngestionEvents({
      batch: [scoreEvent, traceEvent],
      accessLevel: "scores",
      context,
      projectId: "prj_1",
    });
    expect(result.batchForProcessing).toEqual([scoreEvent, traceEvent]);
    expect(result.rejectedErrors).toEqual([]);
    expect(mockDiffResults).toHaveBeenCalledTimes(2);
    expect(mockDiffResults).toHaveBeenCalledWith(
      expect.anything(),
      { ok: true },
      { seam: "ingestion_event", action: "scores:create" },
    );
    expect(mockDiffResults).toHaveBeenCalledWith(
      expect.anything(),
      { ok: false, code: 401 },
      { seam: "ingestion_event", action: "traces:create" },
    );
  });

  it("drops denied events as 207 rejections in enforce mode", () => {
    env.PUBLIC_API_AUTHZ_MIGRATION = "enforce";
    mockAuthorizeIngestionEvent.mockReturnValueOnce(allow());
    mockAuthorizeIngestionEvent.mockReturnValueOnce(deny());
    const result = authorizeIngestionEvents({
      batch: [scoreEvent, traceEvent],
      accessLevel: "scores",
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
    expect(mockDiffResults).not.toHaveBeenCalled();
  });
});

describe("legacyEventVerdict", () => {
  const { legacyEventVerdict } = __test;
  it("always allows sdk logs", () => {
    expect(legacyEventVerdict("scores", eventTypes.SDK_LOG)).toBe(true);
  });
  it("allows scores for a scores or project key", () => {
    expect(legacyEventVerdict("scores", eventTypes.SCORE_CREATE)).toBe(true);
    expect(legacyEventVerdict("project", eventTypes.SCORE_CREATE)).toBe(true);
  });
  it("allows traces only for a project key", () => {
    expect(legacyEventVerdict("scores", eventTypes.TRACE_CREATE)).toBe(false);
    expect(legacyEventVerdict("project", eventTypes.TRACE_CREATE)).toBe(true);
  });
});
