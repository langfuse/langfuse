import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError } from "@langfuse/shared";
import { eventTypes } from "@langfuse/shared/src/server";

import { type AuthorizationContext } from "@/src/features/auth/policy/types";

const { mockEnforceIngestionAuth, mockAuthorizeIngestionEvent } = vi.hoisted(
  () => ({
    mockEnforceIngestionAuth: vi.fn(),
    mockAuthorizeIngestionEvent: vi.fn(),
  }),
);

vi.mock("@/src/features/auth/policy/enforcement.ingestion", () => ({
  enforceIngestionAuth: mockEnforceIngestionAuth,
  authorizeIngestionEvent: mockAuthorizeIngestionEvent,
}));

import {
  authorizeIngestionEvents,
  verifyIngestionAuth,
} from "@/src/features/auth/policy/ingestion";

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

const scope = {
  projectId: "prj_1",
  accessLevel: "project" as const,
  isIngestionSuspended: false,
};

describe("ingestion whole-request seam verifyIngestionAuth", () => {
  const headers = {};

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the resolved scope and context when the pipeline allows", async () => {
    mockEnforceIngestionAuth.mockResolvedValue({
      success: true,
      context,
      projectId: "prj_1",
      scope,
    });
    const result = await verifyIngestionAuth({ headers });
    expect(result).toMatchObject({
      ok: true,
      projectId: "prj_1",
      context,
      authCheck: { validKey: true, scope },
    });
  });

  it("surfaces the pipeline error when authentication fails", async () => {
    const error = new ForbiddenError("nope");
    mockEnforceIngestionAuth.mockResolvedValue({ success: false, error });
    const result = await verifyIngestionAuth({ headers });
    expect(result).toEqual({ ok: false, error });
  });

  it("403s a suspended org through the pipeline", async () => {
    const error = new ForbiddenError(
      "Ingestion suspended: Usage threshold exceeded. Please upgrade your plan.",
    );
    mockEnforceIngestionAuth.mockResolvedValue({ success: false, error });
    const result = await verifyIngestionAuth({ headers });
    expect(result).toMatchObject({ ok: false, error });
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

  it("drops denied events as 207 rejections and keeps allowed events", () => {
    mockAuthorizeIngestionEvent.mockReturnValueOnce(allow());
    mockAuthorizeIngestionEvent.mockReturnValueOnce(deny());
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

  it("keeps every event when the pipeline allows all", () => {
    mockAuthorizeIngestionEvent.mockReturnValue(allow());
    const result = authorizeIngestionEvents({
      batch: [scoreEvent, traceEvent],
      context,
      projectId: "prj_1",
    });
    expect(result.batchForProcessing).toEqual([scoreEvent, traceEvent]);
    expect(result.rejectedErrors).toEqual([]);
  });
});
