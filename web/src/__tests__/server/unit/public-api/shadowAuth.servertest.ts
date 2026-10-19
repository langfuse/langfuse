import { readFileSync } from "fs";
import { fileURLToPath } from "url";

import { trace } from "@opentelemetry/api";
import { type NextApiRequest } from "next";
import { type RouteKind } from "next/dist/server/route-kind";
import { setRequestMeta } from "next/dist/server/request-meta";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ForbiddenError,
  InternalServerError,
  InvalidRequestError,
  ServiceUnavailableError,
} from "@langfuse/shared";
import { logger } from "@langfuse/shared/src/server";
import { Prisma } from "@langfuse/shared/src/db";

const {
  env,
  mockVerifyScope,
  mockLegacyProjectAuth,
  mockEnforceAuth,
  mockShadowAuthDiff,
} = vi.hoisted(() => ({
  env: { API_AUTH_MIGRATION: "legacy" as string },
  mockVerifyScope: vi.fn(),
  mockLegacyProjectAuth: vi.fn(),
  mockEnforceAuth: vi.fn(),
  mockShadowAuthDiff: vi.fn(),
}));

vi.mock("@/src/env.mjs", () => ({ env }));

vi.mock("@/src/features/public-api/server/apiAuth", () => ({
  ApiAuthService: class {
    verifyAuthHeaderAndReturnScope = mockVerifyScope;
  },
}));

vi.mock("@/src/features/public-api/server/verifyProjectApiKeyAuth", () => ({
  verifyAuth: mockLegacyProjectAuth,
}));

vi.mock("@/src/features/public-api/server/enforceAuth", () => ({
  __dangerouslySkipAuthz: "__dangerouslySkipAuthz",
  enforceAuth: mockEnforceAuth,
}));

vi.mock(
  "@/src/features/public-api/server/shadowAuthDiff",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    shadowAuthDiff: mockShadowAuthDiff,
  }),
);

import { shadowAuth, shadowAuthorize } from "@/src/features/public-api/server";
import { authorizeBlobStorageRequest } from "@/src/features/blobstorage-integration/authorizeBlobStorageRequest";
import { type AuthorizationContext } from "@/src/features/auth/policy/types";

const mappedFields = {
  orgId: "org_1",
  plan: "oss",
  rateLimitOverrides: [],
  apiKeyId: "key_1",
  publicKey: "pk-lf-1",
  isIngestionSuspended: false,
  isInAppAgentKey: false,
};

describe("org-family dispatch (allowedAccessLevels ['organization'])", () => {
  const orgScope = { accessLevel: "organization", orgId: "org_1" };
  const projectScope = { accessLevel: "project", projectId: "prj_1" };
  const req = { headers: {}, method: "GET" } as unknown as NextApiRequest;

  const call = () =>
    shadowAuth({
      req,
      action: "projects:read",
      allowedAccessLevels: ["organization"],
    });

  const legacyOrgKey = () =>
    mockVerifyScope.mockResolvedValue({ validKey: true, scope: orgScope });
  const legacyProjectKey = () =>
    mockVerifyScope.mockResolvedValue({ validKey: true, scope: projectScope });
  const legacyInvalid = () =>
    mockVerifyScope.mockResolvedValue({ validKey: false, error: "bad key" });
  const authzAllows = () =>
    mockEnforceAuth.mockResolvedValue({
      success: true,
      scope: { ...mappedFields, projectId: null, accessLevel: "organization" },
    });
  const authzDenies = () =>
    mockEnforceAuth.mockResolvedValue({
      success: false,
      error: new ForbiddenError("nope"),
    });

  beforeEach(() => {
    vi.clearAllMocks();
    env.API_AUTH_MIGRATION = "legacy";
  });

  describe("legacy mode never runs the new pipeline", () => {
    it("returns the legacy scope and skips enforceAuth", async () => {
      legacyOrgKey();
      expect(await call()).toEqual({ success: true, scope: orgScope });
      expect(mockEnforceAuth).not.toHaveBeenCalled();
    });

    it("returns the legacy 401 with the auth message", async () => {
      legacyInvalid();
      expect(await call()).toMatchObject({
        success: false,
        error: { httpCode: 401, message: "bad key" },
      });
    });

    it("403s a non-org key, leaving the body to the route", async () => {
      legacyProjectKey();
      expect(await call()).toMatchObject({
        error: { httpCode: 403 },
      });
    });
  });

  describe("an unset migration mode falls back to legacy", () => {
    it("returns the legacy scope and skips enforceAuth", async () => {
      env.API_AUTH_MIGRATION = undefined as unknown as string;
      legacyOrgKey();
      expect(await call()).toEqual({ success: true, scope: orgScope });
      expect(mockEnforceAuth).not.toHaveBeenCalled();
    });
  });

  describe("shadow mode keeps responses byte-identical to legacy", () => {
    beforeEach(() => {
      env.API_AUTH_MIGRATION = "shadow";
    });

    it("returns the legacy scope even when the new pipeline denies", async () => {
      legacyOrgKey();
      authzDenies();
      expect(await call()).toEqual({ success: true, scope: orgScope });
    });

    it("records the parity cell", async () => {
      legacyOrgKey();
      authzDenies();
      await call();
      expect(mockShadowAuthDiff).toHaveBeenCalledWith(
        { success: false, error: expect.any(ForbiddenError) },
        { success: true, scope: orgScope },
        "projects:read",
        expect.objectContaining({ resource: "GET unknown" }),
      );
    });
  });

  describe("enforce mode decides on the new pipeline alone", () => {
    beforeEach(() => {
      env.API_AUTH_MIGRATION = "enforce";
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("returns the scope the new pipeline built, without calling legacy", async () => {
      authzAllows();
      expect(await call()).toEqual({
        success: true,
        scope: {
          ...mappedFields,
          projectId: null,
          accessLevel: "organization",
        },
      });
      expect(mockVerifyScope).not.toHaveBeenCalled();
    });

    it("passes the route's action to the new pipeline", async () => {
      authzAllows();
      await call();
      expect(mockEnforceAuth).toHaveBeenCalledWith({
        req,
        action: "projects:read",
        allowedAccessLevels: ["organization"],
      });
    });

    it.each([
      { name: "500", ErrorClass: InternalServerError },
      { name: "503", ErrorClass: ServiceUnavailableError },
    ])(
      "sanitizes returned $name details while preserving its status and class",
      async ({ ErrorClass }) => {
        const diagnostic = "database host private-db:5432 rejected lookup";
        const error = new ErrorClass(diagnostic);
        const log = vi.spyOn(logger, "error").mockImplementation(() => logger);
        mockEnforceAuth.mockResolvedValue({ success: false, error });

        const result = await call();

        expect(result).toMatchObject({
          success: false,
          error: {
            httpCode: error.httpCode,
            message: new ErrorClass().message,
          },
        });
        if (result.success) throw new Error("Expected authentication failure");
        expect(result.error).toBeInstanceOf(ErrorClass);
        expect(error.message).toBe(diagnostic);
        expect(JSON.stringify(log.mock.calls)).toContain(diagnostic);
      },
    );

    it("preserves the required permission through blob-storage authorization", async () => {
      const error = new ForbiddenError(
        'Access denied. The "projects:read" permission is required to access this resource.',
      );
      mockEnforceAuth.mockResolvedValue({ success: false, error });

      await expect(authorizeBlobStorageRequest(req)).rejects.toBe(error);
    });

    it.each([
      { name: "500", ErrorClass: InternalServerError },
      { name: "503", ErrorClass: ServiceUnavailableError },
    ])(
      "preserves sanitized $name errors through blob-storage authorization",
      async ({ ErrorClass }) => {
        vi.spyOn(logger, "error").mockImplementation(() => logger);
        mockEnforceAuth.mockResolvedValue({
          success: false,
          error: new ErrorClass(
            "database host private-db:5432 rejected lookup",
          ),
        });

        await expect(authorizeBlobStorageRequest(req)).rejects.toMatchObject({
          name: new ErrorClass().name,
          httpCode: new ErrorClass().httpCode,
          message: new ErrorClass().message,
        });
      },
    );

    it("sanitizes unexpected throws and redacts secrets from diagnostics", async () => {
      const secret = "sk-lf-test-secret-12345678";
      const log = vi.spyOn(logger, "error").mockImplementation(() => logger);
      mockEnforceAuth.mockRejectedValue(new Error(`lookup failed ${secret}`));

      expect(await call()).toMatchObject({
        success: false,
        error: { httpCode: 500, message: new InternalServerError().message },
      });
      const logged = JSON.stringify(log.mock.calls);
      expect(logged).toContain("lookup failed");
      expect(logged).not.toContain(secret);
    });

    it.each([
      {
        name: "typed",
        error: new ServiceUnavailableError("database connection refused"),
      },
      {
        name: "Prisma",
        error: new Prisma.PrismaClientInitializationError(
          "database connection refused",
          "test",
          "P1001",
        ),
      },
    ])(
      "returns a generic 503 for thrown $name infrastructure errors",
      async ({ error }) => {
        mockEnforceAuth.mockRejectedValue(error);
        expect(await call()).toMatchObject({
          success: false,
          error: {
            httpCode: 503,
            message: new ServiceUnavailableError().message,
          },
        });
      },
    );

    it("preserves thrown user errors", async () => {
      const error = new InvalidRequestError("no target");
      mockEnforceAuth.mockRejectedValue(error);
      await expect(call()).rejects.toBe(error);
    });

    it("403s when the new pipeline denies, leaving the body to the route", async () => {
      authzDenies();
      expect(await call()).toMatchObject({
        success: false,
        error: { httpCode: 403, message: "nope" },
      });
    });

    it("surfaces a non-403 new denial with its own message", async () => {
      mockEnforceAuth.mockResolvedValue({
        success: false,
        error: new InvalidRequestError("no target"),
      });
      expect(await call()).toMatchObject({
        success: false,
        error: { httpCode: 400, message: "no target" },
      });
    });

    it("does not record parity telemetry", async () => {
      authzAllows();
      await call();
      expect(mockShadowAuthDiff).not.toHaveBeenCalled();
    });
  });
});

describe("project-family dispatch (allowedAccessLevels ['project'])", () => {
  const legacyScope = { scope: { projectId: "p1", accessLevel: "project" } };
  const req = { headers: {}, method: "GET" } as unknown as NextApiRequest;

  const call = () =>
    shadowAuth({
      req,
      action: "traces:read",
      allowedAccessLevels: ["project"],
    });

  const legacyAllows = () =>
    mockLegacyProjectAuth.mockResolvedValue(legacyScope);
  const legacyDenies = (status: number) =>
    mockLegacyProjectAuth.mockRejectedValue({ status, message: "legacy" });
  const authzAllows = () =>
    mockEnforceAuth.mockResolvedValue({ success: true });
  const authzDenies = () =>
    mockEnforceAuth.mockResolvedValue({
      success: false,
      error: new ForbiddenError("nope"),
    });

  const projectScope = (presentation: "privateKey" | "publicKey") => ({
    projectId: "p1",
    accessLevel: presentation === "publicKey" ? "scores" : "project",
    orgId: "o1",
    plan: "Team",
    rateLimitOverrides: [],
    apiKeyId: "ak1",
    publicKey: "pk-lf-1",
    isIngestionSuspended: false,
    isInAppAgentKey: false,
  });
  const authzAllowsApiKey = (presentation: "privateKey" | "publicKey") =>
    mockEnforceAuth.mockResolvedValue({
      success: true,
      scope: projectScope(presentation),
    });

  beforeEach(() => {
    vi.clearAllMocks();
    env.API_AUTH_MIGRATION = "legacy";
  });

  it.each(["legacy", "shadow"])(
    "%s preserves legacy success and custom failure with a new-pipeline infrastructure failure",
    async (mode) => {
      env.API_AUTH_MIGRATION = mode;
      const newFailure = {
        success: false,
        error: new InternalServerError("private database detail"),
      };
      mockEnforceAuth.mockResolvedValue(newFailure);
      legacyAllows();
      expect(await call()).toEqual({ success: true, scope: legacyScope.scope });

      mockLegacyProjectAuth.mockRejectedValue({
        status: 502,
        message: "custom legacy infrastructure message",
      });
      const result = await call();
      expect(result).toMatchObject({
        success: false,
        error: {
          httpCode: 502,
          message: "custom legacy infrastructure message",
        },
      });
      if (mode === "shadow") {
        expect(mockShadowAuthDiff).toHaveBeenLastCalledWith(
          newFailure,
          expect.objectContaining({ success: false }),
          "traces:read",
          expect.objectContaining({ resource: "GET unknown" }),
        );
      } else {
        expect(mockEnforceAuth).not.toHaveBeenCalled();
      }
    },
  );

  describe("legacy mode never runs the new pipeline", () => {
    it("returns the legacy scope and skips enforceAuth", async () => {
      legacyAllows();
      expect(await call()).toEqual({ success: true, scope: legacyScope.scope });
      expect(mockEnforceAuth).not.toHaveBeenCalled();
    });

    it("returns the legacy error unchanged", async () => {
      legacyDenies(403);
      expect(await call()).toMatchObject({
        success: false,
        error: { httpCode: 403, message: "legacy" },
      });
      expect(mockEnforceAuth).not.toHaveBeenCalled();
    });
  });

  describe("an unrecognized mode fails safe to legacy", () => {
    beforeEach(() => {
      env.API_AUTH_MIGRATION = "";
    });

    it("runs only legacy and skips the new pipeline and parity telemetry", async () => {
      legacyAllows();
      authzDenies();
      expect(await call()).toEqual({ success: true, scope: legacyScope.scope });
      expect(mockEnforceAuth).not.toHaveBeenCalled();
      expect(mockShadowAuthDiff).not.toHaveBeenCalled();
    });
  });

  describe("shadow mode keeps responses byte-identical to legacy", () => {
    beforeEach(() => {
      env.API_AUTH_MIGRATION = "shadow";
    });

    it("returns the legacy scope even when the new pipeline denies", async () => {
      legacyAllows();
      authzDenies();
      expect(await call()).toEqual({ success: true, scope: legacyScope.scope });
    });

    it("returns the legacy denial even when the new pipeline allows", async () => {
      legacyDenies(401);
      authzAllows();
      expect(await call()).toMatchObject({
        success: false,
        error: { httpCode: 401, message: "legacy" },
      });
    });

    it("records the parity cell", async () => {
      legacyAllows();
      authzDenies();
      await call();
      expect(mockShadowAuthDiff).toHaveBeenCalledWith(
        { success: false, error: expect.any(ForbiddenError) },
        { success: true, scope: legacyScope.scope },
        "traces:read",
        expect.objectContaining({ resource: "GET unknown" }),
      );
    });

    it("threads the new pipeline's context to shadow the per-item check", async () => {
      legacyAllows();
      mockEnforceAuth.mockResolvedValue({
        success: true,
        scope: projectScope("privateKey"),
        ctx: { principal: {}, policies: [] },
      });
      expect(await call()).toMatchObject({
        success: true,
        scope: legacyScope.scope,
        ctx: { policies: [] },
      });
    });
  });

  describe("enforce mode is the new pipeline's sole authority", () => {
    beforeEach(() => {
      env.API_AUTH_MIGRATION = "enforce";
    });

    it("returns the new pipeline's project scope", async () => {
      authzAllowsApiKey("privateKey");
      expect(await call()).toEqual({
        success: true,
        scope: {
          projectId: "p1",
          accessLevel: "project",
          orgId: "o1",
          plan: "Team",
          rateLimitOverrides: [],
          apiKeyId: "ak1",
          publicKey: "pk-lf-1",
          isIngestionSuspended: false,
          isInAppAgentKey: false,
        },
      });
    });

    it("returns a scores-level scope for a public key", async () => {
      authzAllowsApiKey("publicKey");
      const result = await call();
      expect(result.success && result.scope.accessLevel).toBe("scores");
    });

    it("never runs legacy verify", async () => {
      authzAllowsApiKey("privateKey");
      await call();
      expect(mockLegacyProjectAuth).not.toHaveBeenCalled();
    });

    it("returns the new pipeline's 403 when it denies", async () => {
      authzDenies();
      expect(await call()).toMatchObject({
        success: false,
        error: { httpCode: 403, message: "nope" },
      });
    });

    it("does not record parity telemetry", async () => {
      authzAllowsApiKey("privateKey");
      await call();
      expect(mockShadowAuthDiff).not.toHaveBeenCalled();
    });
  });
});

describe("shadow parity metadata", () => {
  const scope = {
    ...mappedFields,
    projectId: "prj_1",
    accessLevel: "project" as const,
  };
  const authContext = (): AuthorizationContext => ({
    principal: {
      kind: "apiKey",
      apiKeyId: "key_1",
      userId: null,
      isInAppAgentKey: false,
      publicKey: "pk-lf-1",
      scope: "PROJECT",
      presentation: "privateKey",
      organizations: [],
      boundResource: { orgId: "org_1", projectId: "prj_1" },
    },
    policies: [],
  });
  const request = (route?: string) => {
    const req = {
      headers: { authorization: "Basic secret-credentials" },
      method: "GET",
      url: "/api/public/prompts/private-prompt?secret=private-query",
    } as NextApiRequest;
    if (route) {
      setRequestMeta(req, {
        match: {
          params: undefined,
          definition: {
            kind: "PAGES_API" as RouteKind.PAGES_API,
            pathname: route,
            page: route,
            bundlePath: `pages${route}`,
            filename: "handler.js",
          },
        },
      });
    }
    return req;
  };
  const call = (req: NextApiRequest) =>
    shadowAuth({
      req,
      action: "prompts:read",
      allowedAccessLevels: ["project"],
    });

  beforeEach(() => {
    vi.clearAllMocks();
    env.API_AUTH_MIGRATION = "shadow";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([0, 1])(
    "uses the matched route template with trace flags %s",
    async (traceFlags) => {
      vi.spyOn(trace, "getActiveSpan").mockReturnValue(
        trace.wrapSpanContext({
          traceId: "12345678901234567890123456789012",
          spanId: "1234567890123456",
          traceFlags,
        }),
      );
      mockLegacyProjectAuth.mockResolvedValue({ scope });
      mockEnforceAuth.mockResolvedValue({
        success: false,
        error: new ForbiddenError("new denial"),
      });

      await call(request("/api/public/prompts/[promptName]"));

      expect(mockShadowAuthDiff).toHaveBeenCalledWith(
        expect.objectContaining({ success: false }),
        { success: true, scope },
        "prompts:read",
        {
          apiKeyId: "key_1",
          publicKey: "pk-lf-1",
          resource: "GET /api/public/prompts/[promptName]",
        },
      );
    },
  );

  it("retains the new allow's safe key identity on every repeated mismatch", async () => {
    mockLegacyProjectAuth.mockRejectedValue({ status: 403, message: "legacy" });
    mockEnforceAuth.mockResolvedValue({
      success: true,
      scope,
      ctx: authContext(),
    });
    const req = request("/api/public/prompts/[promptName]");

    await call(req);
    await call(req);

    expect(mockShadowAuthDiff).toHaveBeenCalledTimes(2);
    for (const args of mockShadowAuthDiff.mock.calls) {
      expect(args[3]).toEqual({
        apiKeyId: "key_1",
        publicKey: "pk-lf-1",
        resource: "GET /api/public/prompts/[promptName]",
      });
    }
  });

  it("carries the request resource into every asynchronous per-item check", async () => {
    mockLegacyProjectAuth.mockResolvedValue({ scope });
    mockEnforceAuth.mockResolvedValue({
      success: true,
      scope,
      ctx: authContext(),
    });
    const req = request("/api/public/mcp");
    const result = await call(req);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Expected successful legacy auth");
    setRequestMeta(req, {});
    mockShadowAuthDiff.mockClear();

    await Promise.all(
      [1, 2, 3].map(async () => {
        await Promise.resolve();
        shadowAuthorize({
          ctx: result.ctx,
          action: "prompts:CUD",
          resource: { projectId: "prj_1" },
          legacyDecision: { success: true, scope },
        });
      }),
    );

    expect(mockShadowAuthDiff).toHaveBeenCalledTimes(3);
    for (const args of mockShadowAuthDiff.mock.calls) {
      expect(args[0]).toMatchObject({ success: false });
      expect(args[3]).toEqual({
        apiKeyId: "key_1",
        publicKey: "pk-lf-1",
        resource: "GET /api/public/mcp",
      });
    }
  });

  it("isolates request resources when authentication reuses the same context", async () => {
    mockLegacyProjectAuth.mockResolvedValue({ scope });
    mockEnforceAuth.mockResolvedValue({
      success: true,
      scope,
      ctx: authContext(),
    });
    const first = await call(request("/api/public/mcp"));
    const second = await call(request("/api/public/ingestion"));
    if (!first.success || !second.success) {
      throw new Error("Expected successful legacy auth");
    }
    mockShadowAuthDiff.mockClear();

    for (const result of [first, second]) {
      shadowAuthorize({
        ctx: result.ctx,
        action: "prompts:CUD",
        resource: { projectId: "prj_1" },
        legacyDecision: { success: true, scope },
      });
    }

    expect(
      mockShadowAuthDiff.mock.calls.map((args) => args[3].resource),
    ).toEqual(["GET /api/public/mcp", "GET /api/public/ingestion"]);
  });

  it("never falls back to a concrete URL when route metadata is unavailable", async () => {
    mockLegacyProjectAuth.mockResolvedValue({ scope });
    mockEnforceAuth.mockResolvedValue({
      success: false,
      error: new ForbiddenError("new denial"),
    });

    await call(request());

    expect(mockShadowAuthDiff.mock.calls[0][3]).toEqual({
      apiKeyId: "key_1",
      publicKey: "pk-lf-1",
      resource: "GET unknown",
    });
  });
});

describe("the migration-mode gate reads a declared env var", () => {
  const source = (relativeToSrc: string) =>
    readFileSync(
      fileURLToPath(new URL(`../../../../${relativeToSrc}`, import.meta.url)),
      "utf8",
    );

  it("reads only env keys env.mjs declares", () => {
    const seam = source("features/public-api/server/shadowAuth.ts");
    const schema = source("env.mjs");
    const keys = [...seam.matchAll(/\benv\.([A-Z][A-Z0-9_]*)/g)].map(
      (match) => match[1],
    );
    expect(keys.length).toBeGreaterThan(0);
    for (const key of new Set(keys)) {
      expect(schema).toMatch(new RegExp(`\\b${key}:\\s*z\\b`));
    }
  });

  it("defaults the migration mode to enforce", () => {
    expect(source("env.mjs")).toMatch(
      /API_AUTH_MIGRATION:\s*z[^;]*?\.default\("enforce"\)/,
    );
  });
});
