import { beforeEach, describe, expect, it, vi } from "vitest";
import { type NextApiRequest, type NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";

import { OrganizationId, ProjectId, SystemRoleId } from "@langfuse/shared/rbac";
import { processEventBatch } from "@langfuse/shared/src/server";
import { type AuthorizationContext } from "@/src/features/auth/policy/types";
import handler, {
  filterBatchForEventsOnly,
} from "@/src/pages/api/public/ingestion";

const {
  migration,
  shadowAuth,
  recordIncrement,
  legacyIngestionGate,
  originalProcessEventBatch,
} = vi.hoisted(() => ({
  migration: { mode: "shadow" as "legacy" | "shadow" | "enforce" },
  shadowAuth: vi.fn(),
  recordIncrement: vi.fn(),
  legacyIngestionGate: {
    writeMode: "dual" as "legacy" | "dual" | "events_only",
    scoreOnlyCutoff: undefined as string | undefined,
  },
  originalProcessEventBatch: {
    current: undefined as typeof processEventBatch | undefined,
  },
}));

vi.mock(import("@/src/env.mjs"), async (importOriginal) => {
  const original = await importOriginal();
  return {
    env: new Proxy(original.env, {
      get(target, property, receiver) {
        if (property === "API_AUTH_MIGRATION") return migration.mode;
        if (property === "LANGFUSE_MIGRATION_V4_WRITE_MODE") {
          return legacyIngestionGate.writeMode;
        }
        if (
          property === "LANGFUSE_LEGACY_INGESTION_SCORE_ONLY_ORG_CREATED_CUTOFF"
        ) {
          return legacyIngestionGate.scoreOnlyCutoff;
        }
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
  originalProcessEventBatch.current = original.processEventBatch;
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
    expect(
      filterBatchForEventsOnly([scoreEvent, sdkLogEvent], "events_only"),
    ).toEqual({
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

  it("points events_only rejections at the SDK upgrade, the OTel endpoint, and the write-mode bridge", () => {
    const [rejection] = filterBatchForEventsOnly(
      [sdkLogEvent],
      "events_only",
    ).rejectedErrors;

    expect(rejection.error).toContain("Upgrade to the latest Langfuse SDKs");
    expect(rejection.error).toContain("POST /api/public/otel/v1/traces");
    expect(rejection.error).toContain("LANGFUSE_MIGRATION_V4_WRITE_MODE=dual");
  });

  it("preserves sdk-log compatibility outside v4-only mode", () => {
    expect(filterBatchForEventsOnly([sdkLogEvent], null)).toEqual({
      batchForProcessing: [sdkLogEvent],
      rejectedErrors: [],
    });
  });
});

const CUTOFF = "2026-10-01T00:00:00.000Z";

const mixedBatch = [
  {
    id: "trace-event",
    timestamp: "2026-10-01T00:00:00.000Z",
    type: "trace-create",
    body: { id: "trace-id" },
  },
  {
    id: "score-event",
    timestamp: "2026-10-01T00:00:00.000Z",
    type: "score-create",
    body: { id: "score-id", name: "quality", value: 1 },
  },
  {
    id: "log-event",
    timestamp: "2026-10-01T00:00:00.000Z",
    type: "sdk-log",
    body: { log: "test" },
  },
  {
    id: "generation-event",
    timestamp: "2026-10-01T00:00:00.000Z",
    type: "generation-update",
    body: { id: "generation-id" },
  },
];

describe("legacy ingestion score-only organization cutoff", () => {
  beforeEach(() => {
    migration.mode = "legacy";
    legacyIngestionGate.writeMode = "dual";
    legacyIngestionGate.scoreOnlyCutoff = undefined;
    shadowAuth.mockReset();
    recordIncrement.mockClear();
    vi.mocked(processEventBatch).mockReset();
    vi.mocked(processEventBatch).mockImplementation(async (batch) => ({
      successes: (batch as { id?: string }[]).map((event) => ({
        id: typeof event.id === "string" ? event.id : "unknown",
        status: 201,
      })),
      errors: [],
    }));
  });

  function authorizeOrg(organizationCreatedAt?: string) {
    shadowAuth.mockResolvedValue({
      success: true,
      scope: {
        accessLevel: "project",
        projectId: "project",
        orgId: "org",
        organizationCreatedAt,
        apiKeyId: "key",
        publicKey: "pk-lf-test",
        plan: "cloud:hobby",
        rateLimitOverrides: [],
      },
    });
  }

  async function postBatch() {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      headers: { authorization: "Basic dGVzdDp0ZXN0" },
      body: { batch: mixedBatch },
    });
    await handler(req, res);
    return res;
  }

  it("keeps every event when the cutoff is unset", async () => {
    authorizeOrg("2026-10-02T00:00:00.000Z");

    const res = await postBatch();

    expect(res._getStatusCode()).toBe(207);
    expect(res._getJSONData().errors).toEqual([]);
    expect(vi.mocked(processEventBatch).mock.calls[0][0]).toEqual(mixedBatch);
    expect(recordIncrement).not.toHaveBeenCalledWith(
      "langfuse.public_api.legacy_ingestion_non_score_rejected",
      expect.anything(),
      expect.anything(),
    );
  });

  it("keeps every event for an organization created before the cutoff", async () => {
    legacyIngestionGate.scoreOnlyCutoff = CUTOFF;
    authorizeOrg("2026-09-30T23:59:59.999Z");

    const res = await postBatch();

    expect(res._getStatusCode()).toBe(207);
    expect(res._getJSONData().errors).toEqual([]);
    expect(vi.mocked(processEventBatch).mock.calls[0][0]).toEqual(mixedBatch);
    expect(recordIncrement).not.toHaveBeenCalledWith(
      "langfuse.public_api.legacy_ingestion_non_score_rejected",
      expect.anything(),
      expect.anything(),
    );
  });

  it.each([
    ["on the cutoff", CUTOFF],
    ["after the cutoff", "2026-10-02T00:00:00.000Z"],
  ])(
    "rejects non-score events with the organization cutoff error for an organization created %s",
    async (_label, organizationCreatedAt) => {
      legacyIngestionGate.scoreOnlyCutoff = CUTOFF;
      authorizeOrg(organizationCreatedAt);

      const res = await postBatch();

      const cutoffError = expect.stringContaining(
        "no longer accepts trace or observation writes for this organization",
      );
      expect(res._getStatusCode()).toBe(207);
      expect(res._getJSONData()).toMatchObject({
        successes: [{ id: "score-event", status: 201 }],
        errors: [
          {
            id: "trace-event",
            status: 400,
            message: "Event type not accepted",
            error: cutoffError,
          },
          {
            id: "log-event",
            status: 400,
            message: "Event type not accepted",
            error: cutoffError,
          },
          {
            id: "generation-event",
            status: 400,
            message: "Event type not accepted",
            error: cutoffError,
          },
        ],
      });
      const [rejection] = res._getJSONData().errors as { error: string }[];
      expect(rejection.error).toContain("POST /api/public/otel/v1/traces");
      expect(rejection.error).toContain("POST /api/public/scores");
      expect(rejection.error).not.toContain("events_only");
      expect(rejection.error).not.toContain("LANGFUSE_MIGRATION_V4_WRITE_MODE");
      expect(vi.mocked(processEventBatch).mock.calls[0][0]).toEqual([
        mixedBatch[1],
      ]);
      expect(recordIncrement).toHaveBeenCalledTimes(1);
      expect(recordIncrement).toHaveBeenCalledWith(
        "langfuse.public_api.legacy_ingestion_non_score_rejected",
        3,
        { route: "POST /api/public/ingestion" },
      );
    },
  );

  it("keeps ingestion unchanged when the scope has no organization createdAt", async () => {
    legacyIngestionGate.scoreOnlyCutoff = CUTOFF;
    authorizeOrg(undefined);

    const res = await postBatch();

    expect(res._getJSONData().errors).toEqual([]);
    expect(vi.mocked(processEventBatch).mock.calls[0][0]).toEqual(mixedBatch);
    expect(recordIncrement).not.toHaveBeenCalled();
  });
});

describe("ingestion per-event shadow comparison", () => {
  beforeEach(() => {
    migration.mode = "shadow";
    legacyIngestionGate.writeMode = "dual";
    legacyIngestionGate.scoreOnlyCutoff = undefined;
    shadowAuth.mockReset();
    recordIncrement.mockClear();
    vi.mocked(processEventBatch).mockReset();
    vi.mocked(processEventBatch).mockImplementation((input, auth, options) =>
      originalProcessEventBatch.current!(input, auth, options),
    );
  });

  it.each([
    ["legacy", false, undefined],
    ["shadow", false, undefined],
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
