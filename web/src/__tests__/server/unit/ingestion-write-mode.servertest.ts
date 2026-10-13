import { beforeEach, describe, expect, it, vi } from "vitest";
import { type NextApiRequest, type NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";

import { OrganizationId, ProjectId, SystemRoleId } from "@langfuse/shared/rbac";
import { processEventBatch } from "@langfuse/shared/src/server";
import { type AuthorizationContext } from "@/src/features/auth/policy/types";
import handler, {
  filterBatchForEventsOnly,
} from "@/src/pages/api/public/ingestion";

const { migration, shadowAuth, recordIncrement } = vi.hoisted(() => ({
  migration: { mode: "shadow" as "legacy" | "shadow" | "enforce" },
  shadowAuth: vi.fn(),
  recordIncrement: vi.fn(),
}));

vi.mock(import("@/src/env.mjs"), async (importOriginal) => {
  const original = await importOriginal();
  return {
    env: new Proxy(original.env, {
      get(target, property, receiver) {
        if (property === "API_AUTH_MIGRATION") return migration.mode;
        if (property === "LANGFUSE_MIGRATION_V4_WRITE_MODE") return "dual";
        return Reflect.get(target, property, receiver);
      },
    }),
  };
});

vi.mock(import("@/src/features/public-api/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  shadowAuth,
}));

vi.mock(import("@langfuse/shared/src/server"), async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    processEventBatch: vi.fn(original.processEventBatch),
    recordIncrement,
  };
});

vi.mock("@/src/features/telemetry", () => ({ telemetry: vi.fn() }));
vi.mock("@/src/features/public-api/server/RateLimitService", () => ({
  RateLimitService: {
    getInstance: () => ({
      rateLimitRequest: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

describe("legacy ingestion write-mode filter", () => {
  const scoreEvent = { id: "score", type: "score-create" };
  const sdkLogEvent = { id: "log", type: "sdk-log" };

  it("allows only score events in v4-only mode", () => {
    expect(filterBatchForEventsOnly([scoreEvent, sdkLogEvent], true)).toEqual({
      batchForProcessing: [scoreEvent],
      rejectedErrors: [
        expect.objectContaining({
          id: "log",
          status: 400,
          message: "Event type not accepted",
          error: expect.stringContaining("only accepts score events"),
        }),
      ],
    });
  });

  it("preserves sdk-log compatibility outside v4-only mode", () => {
    expect(filterBatchForEventsOnly([sdkLogEvent], false)).toEqual({
      batchForProcessing: [sdkLogEvent],
      rejectedErrors: [],
    });
  });
});

describe("ingestion per-event shadow comparison", () => {
  beforeEach(() => {
    migration.mode = "shadow";
    shadowAuth.mockReset();
    recordIncrement.mockClear();
    vi.mocked(processEventBatch).mockClear();
  });

  it.each([
    ["legacy", false, undefined],
    ["shadow", false, "match"],
    ["shadow", true, "new_allows"],
    ["enforce", false, undefined],
  ] as const)(
    "%s keeps public-key trace rejection when new authorization allows=%s",
    async (mode, allowTrace, parity) => {
      migration.mode = mode;
      const ctx: AuthorizationContext = {
        principal: {
          kind: "apiKey",
          apiKeyId: "key",
          userId: null,
          isInAppAgentKey: false,
          publicKey: "pk-lf-test",
          scope: "PROJECT",
          presentation: "publicKey",
          organizations: [],
          boundResource: { orgId: "org", projectId: "project" },
        },
        policies: allowTrace
          ? [
              {
                id: "trace-policy",
                tenantId: OrganizationId("org"),
                roleId: SystemRoleId("ADMIN"),
                actions: ["traces:create"],
                resources: [ProjectId("project")],
                effect: "ALLOW",
              },
            ]
          : [],
      };
      shadowAuth.mockResolvedValue({
        success: true,
        scope: {
          accessLevel: "scores",
          projectId: "project",
          orgId: "org",
          apiKeyId: "key",
          publicKey: "pk-lf-test",
          plan: "cloud:hobby",
          rateLimitOverrides: [],
        },
        ctx: mode === "legacy" ? undefined : ctx,
      });
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        headers: { authorization: "Bearer pk-lf-test" },
        body: {
          batch: [
            { id: "invalid-event", type: "trace-create" },
            {
              id: "trace-event",
              timestamp: new Date().toISOString(),
              type: "trace-create",
              body: { id: "trace-id" },
            },
            {
              id: "log-event",
              timestamp: new Date().toISOString(),
              type: "sdk-log",
              body: { log: "test" },
            },
          ],
        },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(207);
      expect(res._getJSONData()).toMatchObject({
        successes: [],
        errors: [
          { id: "invalid-event", status: 401, error: "Access Scope Denied" },
          { id: "trace-event", status: 401, error: "Access Scope Denied" },
        ],
      });
      expect(vi.mocked(processEventBatch).mock.calls[0][0]).not.toContainEqual(
        expect.objectContaining({ id: "trace-event" }),
      );
      if (parity) {
        expect(recordIncrement).toHaveBeenCalledWith(
          "langfuse.authz.parity",
          1,
          expect.objectContaining({
            action: "traces:create",
            result: parity,
            legacy_code: 401,
          }),
        );
      } else {
        expect(recordIncrement).not.toHaveBeenCalledWith(
          "langfuse.authz.parity",
          expect.anything(),
          expect.anything(),
        );
      }
    },
  );
});
