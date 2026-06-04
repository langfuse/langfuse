import type { Session } from "next-auth";
import type { Mock } from "vitest";

import { env } from "@/src/env.mjs";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import {
  decryptSecretHeaders,
  fetchWithSecureRedirects,
  getObservationById,
  getObservationByIdFromEventsTable,
  getTraceById,
  getTraceByIdFromEventsTable,
  getTracesIdentifierForSession,
  getTracesIdentifierForSessionFromEvents,
  validateWebhookURL,
} from "@langfuse/shared/src/server";

vi.mock("@langfuse/shared/src/server", async () => {
  const actual = await vi.importActual("@langfuse/shared/src/server");
  return {
    ...actual,
    createDisplayHeaders: vi.fn(
      (headers: Record<string, { secret: boolean; value: string }>) =>
        Object.fromEntries(
          Object.entries(headers).map(([name, header]) => [
            name,
            {
              secret: header.secret,
              value: header.secret ? "****" : header.value,
            },
          ]),
        ),
    ),
    decryptSecretHeaders: vi.fn(
      (headers: Record<string, { secret: boolean; value: string }>) =>
        Object.fromEntries(
          Object.entries(headers).map(([name, header]) => [
            name,
            {
              secret: header.secret,
              value:
                header.secret && header.value.startsWith("encrypted:")
                  ? header.value.slice("encrypted:".length)
                  : header.value,
            },
          ]),
        ),
    ),
    encryptSecretHeaders: vi.fn(
      (headers: Record<string, { secret: boolean; value: string }>) =>
        Object.fromEntries(
          Object.entries(headers).map(([name, header]) => [
            name,
            {
              secret: header.secret,
              value: header.secret ? `encrypted:${header.value}` : header.value,
            },
          ]),
        ),
    ),
    fetchWithSecureRedirects: vi.fn(),
    getObservationById: vi.fn(),
    getObservationByIdFromEventsTable: vi.fn(),
    getTraceById: vi.fn(),
    getTraceByIdFromEventsTable: vi.fn(),
    getTracesIdentifierForSession: vi.fn(),
    getTracesIdentifierForSessionFromEvents: vi.fn(),
    validateWebhookURL: vi.fn(),
  };
});

const buildSession = ({
  orgId,
  projectId,
  projectRole = "ADMIN",
}: {
  orgId: string;
  projectId: string;
  projectRole?: "ADMIN" | "MEMBER" | "OWNER" | "VIEWER";
}): Session => ({
  expires: "1",
  user: {
    id: "user-1",
    name: "Demo User",
    canCreateOrganizations: true,
    organizations: [
      {
        id: orgId,
        name: "Test Organization",
        role: "OWNER",
        plan: "cloud:hobby",
        cloudConfig: undefined,
        metadata: {},
        projects: [
          {
            id: projectId,
            role: projectRole,
            name: "Test Project",
            deletedAt: null,
            retentionDays: null,
            metadata: {},
          },
        ],
      },
    ],
    featureFlags: {
      templateFlag: true,
      excludeClickhouseRead: false,
    },
    admin: false,
    v4BetaEnabled: false,
  },
  environment: {} as any,
});

type StoredEndpoint = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  projectId: string;
  name: string;
  url: string;
  enabled: boolean;
  toastMessage: string;
  requestHeaders: unknown;
  displayHeaders: unknown;
};

type StoredEndpointWhere = Partial<
  Pick<StoredEndpoint, "enabled" | "id" | "projectId">
>;
type AppRouterCaller = ReturnType<typeof appRouter.createCaller>;
type WebCalloutUpsertInput = Parameters<
  AppRouterCaller["webCallouts"]["upsert"]
>[0];

const createPrismaStub = () => {
  const endpoints: StoredEndpoint[] = [];
  const sessions = new Set<string>();
  let endpointCounter = 0;

  const matchesWhere = (endpoint: StoredEndpoint, where: StoredEndpointWhere) =>
    (where.id === undefined || endpoint.id === where.id) &&
    (where.projectId === undefined || endpoint.projectId === where.projectId) &&
    (where.enabled === undefined || endpoint.enabled === where.enabled);

  const applySelect = (
    endpoint: StoredEndpoint,
    select?: Partial<Record<keyof StoredEndpoint, boolean>>,
  ) => {
    if (!select) return endpoint;

    return Object.fromEntries(
      Object.entries(select)
        .filter(([, enabled]) => enabled)
        .map(([field]) => [field, endpoint[field as keyof StoredEndpoint]]),
    );
  };

  const prismaStub = {
    webCalloutEndpoint: {
      create: vi.fn(
        async ({
          data,
        }: {
          data: Omit<StoredEndpoint, "createdAt" | "id" | "updatedAt">;
        }) => {
          const endpoint = {
            id: `endpoint-${++endpointCounter}`,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...data,
          };
          endpoints.push(endpoint);
          return endpoint;
        },
      ),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        const index = endpoints.findIndex(
          (endpoint) => endpoint.id === where.id,
        );
        if (index === -1) {
          throw new Error("Endpoint not found");
        }
        return endpoints.splice(index, 1)[0];
      }),
      findFirst: vi.fn(
        async ({
          select,
          where,
        }: {
          select?: Partial<Record<keyof StoredEndpoint, boolean>>;
          where: StoredEndpointWhere;
        }) => {
          const endpoint = endpoints.find((candidate) =>
            matchesWhere(candidate, where),
          );

          if (!endpoint) {
            return null;
          }

          return applySelect(endpoint, select);
        },
      ),
      findMany: vi.fn(async ({ where }: { where: StoredEndpointWhere }) =>
        endpoints.filter((endpoint) => matchesWhere(endpoint, where)),
      ),
      findUnique: vi.fn(
        async ({ where }: { where: { id?: string; projectId?: string } }) => {
          const endpoint = endpoints.find((candidate) =>
            matchesWhere(candidate, where),
          );
          return endpoint ?? null;
        },
      ),
      update: vi.fn(
        async ({
          data,
          where,
        }: {
          data: Partial<StoredEndpoint>;
          where: { id: string };
        }) => {
          const endpoint = endpoints.find(
            (candidate) => candidate.id === where.id,
          );
          if (!endpoint) {
            throw new Error("Endpoint not found");
          }

          Object.assign(endpoint, data, { updatedAt: new Date() });
          return endpoint;
        },
      ),
    },
    auditLog: {
      create: vi.fn(),
    },
    traceSession: {
      findFirst: vi.fn(
        async ({
          select,
          where,
        }: {
          select?: Record<string, boolean>;
          where: { id: string; projectId: string };
        }) => {
          if (!sessions.has(`${where.projectId}:${where.id}`)) {
            return null;
          }

          if (select) {
            return Object.fromEntries(
              Object.entries(select)
                .filter(([, enabled]) => enabled)
                .map(([field]) => [field, field === "id" ? where.id : true]),
            );
          }

          return { id: where.id, projectId: where.projectId };
        },
      ),
    },
  };

  return {
    endpoints,
    prisma: prismaStub,
    sessions,
  };
};

const prepare = async ({
  projectRole = "ADMIN",
}: { projectRole?: "ADMIN" | "MEMBER" | "OWNER" | "VIEWER" } = {}) => {
  const orgId = "org-1";
  const projectId = "project-1";
  const prismaStub = createPrismaStub();

  const ctx = createInnerTRPCContext({
    session: buildSession({ orgId, projectId, projectRole }),
    headers: {},
  });

  return {
    caller: appRouter.createCaller({
      ...ctx,
      prisma: prismaStub.prisma as any,
    }),
    orgId,
    projectId,
    prismaStub,
  };
};

const createEndpoint = async (
  caller: AppRouterCaller,
  projectId: string,
  overrides: Partial<WebCalloutUpsertInput> = {},
) =>
  caller.webCallouts.upsert({
    projectId,
    name: "Default",
    url: "https://example.com/callout",
    enabled: true,
    toastMessage: "Sent to app",
    requestHeaders: {},
    ...overrides,
  });

const mockSuccessfulTargetValidation = ({
  traceSessionId = null,
  observationSessionId = null,
}: {
  traceSessionId?: string | null;
  observationSessionId?: string | null;
} = {}) => {
  (getTraceById as Mock).mockImplementation(async ({ traceId }) => ({
    id: traceId,
    sessionId: traceSessionId,
  }));
  (getObservationById as Mock).mockImplementation(async ({ id, traceId }) => ({
    id,
    traceId,
    sessionId: observationSessionId,
  }));
};

describe("webCallouts router", () => {
  const originalCloudRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
  const originalNodeEnv = env.NODE_ENV;

  beforeEach(() => {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
    (validateWebhookURL as Mock).mockResolvedValue(undefined);
    (fetchWithSecureRedirects as Mock).mockResolvedValue({
      response: { ok: true, status: 204 },
      redirectChain: [],
      finalUrl: "https://example.com/callout",
    });
    mockSuccessfulTargetValidation();
    (getTraceByIdFromEventsTable as Mock).mockResolvedValue(undefined);
    (getObservationByIdFromEventsTable as Mock).mockResolvedValue(undefined);
    (getTracesIdentifierForSession as Mock).mockResolvedValue([]);
    (getTracesIdentifierForSessionFromEvents as Mock).mockResolvedValue([]);
  });

  afterEach(() => {
    (env as any).NODE_ENV = originalNodeEnv;
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  afterAll(() => {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalCloudRegion;
  });

  it("creates a safe endpoint and exposes only minimal invoke metadata", async () => {
    const { caller, prismaStub, projectId } = await prepare();

    const endpoint = await createEndpoint(caller, projectId, {
      requestHeaders: {
        Authorization: {
          secret: true,
          value: "Bearer secret-token",
        },
        "X-Env": {
          secret: false,
          value: "prod",
        },
      },
    });

    expect(endpoint.displayHeaders.Authorization?.value).toBe("****");
    expect(endpoint.displayHeaders["X-Env"]?.value).toBe("prod");
    expect("requestHeaders" in endpoint).toBe(false);

    const stored = prismaStub.endpoints.find(
      (candidate) => candidate.id === endpoint.id,
    );
    expect((stored?.requestHeaders as any).Authorization.value).toBe(
      "encrypted:Bearer secret-token",
    );
    expect((stored?.requestHeaders as any)["X-Env"].value).toBe("prod");

    const endpoints = await caller.webCallouts.all({ projectId });
    expect(endpoints).toHaveLength(1);
    expect("requestHeaders" in endpoints[0]).toBe(false);

    const enabled = await caller.webCallouts.enabled({ projectId });
    expect(enabled).toEqual({
      enabled: true,
      id: endpoint.id,
      name: "Default",
      toastMessage: "Sent to app",
    });
    expect(enabled).not.toHaveProperty("url");
    expect(enabled).not.toHaveProperty("requestHeaders");
  });

  it("allows callout URLs on custom ports", async () => {
    const { caller, projectId } = await prepare();

    const endpoint = await createEndpoint(caller, projectId, {
      url: "https://example.com:8443/callout",
      toastMessage: "Callout sent",
    });

    expect(endpoint.url).toBe("https://example.com:8443/callout");
    expect(validateWebhookURL).toHaveBeenCalledWith(
      "https://example.com:8443/callout",
      expect.any(Object),
      { allowedPorts: "any" },
    );
  });

  it("allows loopback callout targets in local development", async () => {
    (env as any).NODE_ENV = "development";
    const { caller, projectId } = await prepare();

    await createEndpoint(caller, projectId, {
      url: "http://127.0.0.1:4047/api/langfuse-trace",
      toastMessage: "Callout sent",
    });

    expect(validateWebhookURL).toHaveBeenCalledWith(
      "http://127.0.0.1:4047/api/langfuse-trace",
      expect.objectContaining({
        hosts: expect.arrayContaining(["localhost", "127.0.0.1", "[::1]"]),
        ips: expect.arrayContaining(["127.0.0.1", "::1"]),
        ip_ranges: expect.arrayContaining(["127.0.0.0/8", "::1/128"]),
      }),
      { allowedPorts: "any" },
    );
  });

  it("enforces max one endpoint per project", async () => {
    const { caller, prismaStub, projectId } = await prepare();

    await createEndpoint(caller, projectId);

    await expect(
      createEndpoint(caller, projectId, {
        name: "Second",
        url: "https://example.com/other",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(prismaStub.endpoints).toHaveLength(1);
    expect(prismaStub.prisma.webCalloutEndpoint.create).toHaveBeenCalledTimes(
      1,
    );
  });

  it("rejects unsafe header names", async () => {
    const { caller, projectId } = await prepare();

    await expect(
      createEndpoint(caller, projectId, {
        requestHeaders: {
          "Content-Type": {
            secret: false,
            value: "text/plain",
          },
        },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("requires authentication headers to be marked secret", async () => {
    const { caller, projectId } = await prepare();

    await expect(
      createEndpoint(caller, projectId, {
        requestHeaders: {
          Authorization: {
            secret: false,
            value: "Bearer secret-token",
          },
        },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("limits configured request headers", async () => {
    const { caller, projectId } = await prepare();

    await expect(
      createEndpoint(caller, projectId, {
        requestHeaders: Object.fromEntries(
          Array.from({ length: 21 }, (_, index) => [
            `X-Test-${index}`,
            {
              secret: false,
              value: "value",
            },
          ]),
        ),
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "At most 20 request headers can be configured.",
    });

    await expect(
      createEndpoint(caller, projectId, {
        requestHeaders: {
          "X-Large": {
            secret: false,
            value: "a".repeat(4097),
          },
        },
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: 'Header "X-Large" value must be at most 4096 bytes.',
    });
  });

  it("keeps setup management gated by integrations access", async () => {
    const { caller, orgId, prismaStub, projectId } = await prepare();
    await createEndpoint(caller, projectId);

    const viewerCtx = createInnerTRPCContext({
      session: buildSession({ orgId, projectId, projectRole: "VIEWER" }),
      headers: {},
    });
    const viewerCaller = appRouter.createCaller({
      ...viewerCtx,
      prisma: prismaStub.prisma as any,
    });

    await expect(
      viewerCaller.webCallouts.all({ projectId }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      viewerCaller.webCallouts.upsert({
        projectId,
        name: "Viewer update",
        url: "https://example.com/viewer",
        enabled: true,
        toastMessage: "Sent",
        requestHeaders: {},
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows project viewers to resolve invoke metadata and invoke callouts", async () => {
    const { caller, orgId, prismaStub, projectId } = await prepare();
    const endpoint = await createEndpoint(caller, projectId);

    const viewerCtx = createInnerTRPCContext({
      session: buildSession({ orgId, projectId, projectRole: "VIEWER" }),
      headers: {},
    });
    const viewerCaller = appRouter.createCaller({
      ...viewerCtx,
      prisma: prismaStub.prisma as any,
    });

    await expect(
      viewerCaller.webCallouts.enabled({ projectId }),
    ).resolves.toEqual({
      enabled: true,
      id: endpoint.id,
      name: "Default",
      toastMessage: "Sent to app",
    });

    await expect(
      viewerCaller.webCallouts.invoke({
        projectId,
        traceId: "trace-1",
        observationId: null,
        sessionId: null,
      }),
    ).resolves.toEqual({ success: true, status: 204 });
  });

  it("invokes the backend endpoint with decrypted headers and id-only payload", async () => {
    const { caller, prismaStub, projectId } = await prepare();
    prismaStub.sessions.add(`${projectId}:session-1`);
    mockSuccessfulTargetValidation({
      traceSessionId: "session-1",
      observationSessionId: "session-1",
    });
    await createEndpoint(caller, projectId, {
      requestHeaders: {
        Authorization: {
          secret: true,
          value: "Bearer secret-token",
        },
        "X-Env": {
          secret: false,
          value: "prod",
        },
      },
    });

    await expect(
      caller.webCallouts.invoke({
        projectId,
        traceId: "trace-1",
        observationId: "observation-1",
        sessionId: "session-1",
      }),
    ).resolves.toEqual({ success: true, status: 204 });

    expect(fetchWithSecureRedirects).toHaveBeenCalledTimes(1);
    const [url, request, redirectOptions] = (fetchWithSecureRedirects as Mock)
      .mock.calls[0];
    expect(url).toBe("https://example.com/callout");
    expect(request.method).toBe("POST");
    expect(JSON.parse(request.body)).toEqual({
      version: 1,
      items: [
        {
          projectId,
          traceId: "trace-1",
          observationId: "observation-1",
          sessionId: "session-1",
        },
      ],
    });
    expect(request.headers.get("Authorization")).toBe("Bearer secret-token");
    expect(request.headers.get("X-Env")).toBe("prod");
    expect(request.headers.get("Content-Type")).toBe("application/json");
    expect(redirectOptions).toMatchObject({
      maxRedirects: 10,
      additionalSensitiveHeaders: ["Authorization"],
      redirectValidation: {
        logContext: "Web callout",
      },
    });
    expect(redirectOptions.redirectValidation.validateUrl).toEqual(
      expect.any(Function),
    );
  });

  it("does not invoke when a configured secret header cannot be decrypted", async () => {
    const { caller, projectId } = await prepare();
    await createEndpoint(caller, projectId, {
      requestHeaders: {
        Authorization: {
          secret: true,
          value: "Bearer secret-token",
        },
      },
    });
    (decryptSecretHeaders as Mock).mockReturnValueOnce({});

    await expect(
      caller.webCallouts.invoke({
        projectId,
        traceId: "trace-1",
        observationId: null,
        sessionId: null,
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message:
        "Failed to decrypt web callout headers. Please update the web callout configuration.",
    });
    expect(fetchWithSecureRedirects).not.toHaveBeenCalled();
  });

  it("supports session-only callouts", async () => {
    const { caller, prismaStub, projectId } = await prepare();
    prismaStub.sessions.add(`${projectId}:session-1`);
    await createEndpoint(caller, projectId);

    await caller.webCallouts.invoke({
      projectId,
      traceId: null,
      observationId: null,
      sessionId: "session-1",
    });

    const [, request] = (fetchWithSecureRedirects as Mock).mock.calls[0];
    expect(JSON.parse(request.body)).toEqual({
      version: 1,
      items: [
        {
          projectId,
          traceId: null,
          observationId: null,
          sessionId: "session-1",
        },
      ],
    });
  });

  it("rejects invoke requests without a trace or session id", async () => {
    const { caller, projectId } = await prepare();
    await createEndpoint(caller, projectId);

    await expect(
      caller.webCallouts.invoke({
        projectId,
        traceId: null,
        observationId: null,
        sessionId: null,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(fetchWithSecureRedirects).not.toHaveBeenCalled();
  });

  it("does not invoke when the trace does not belong to the project", async () => {
    const { caller, projectId } = await prepare();
    await createEndpoint(caller, projectId);
    (getTraceById as Mock).mockResolvedValueOnce(undefined);

    await expect(
      caller.webCallouts.invoke({
        projectId,
        traceId: "trace-1",
        observationId: null,
        sessionId: null,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(fetchWithSecureRedirects).not.toHaveBeenCalled();
  });

  it("surfaces non-2xx backend responses", async () => {
    const { caller, projectId } = await prepare();
    await createEndpoint(caller, projectId);
    (fetchWithSecureRedirects as Mock).mockResolvedValueOnce({
      response: { ok: false, status: 404 },
      redirectChain: [],
      finalUrl: "https://example.com/callout",
    });

    await expect(
      caller.webCallouts.invoke({
        projectId,
        traceId: "trace-1",
        observationId: null,
        sessionId: null,
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Web callout endpoint returned HTTP 404.",
    });
  });

  it("uses the fixed server timeout for backend calls", async () => {
    vi.useFakeTimers();
    const { caller, projectId } = await prepare();
    await createEndpoint(caller, projectId);
    (fetchWithSecureRedirects as Mock).mockImplementationOnce(
      async (_url, request: RequestInit) =>
        new Promise((_, reject) => {
          request.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          );
        }),
    );

    const invoke = caller.webCallouts.invoke({
      projectId,
      traceId: "trace-1",
      observationId: null,
      sessionId: null,
    });
    const expectation = expect(invoke).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Web callout timed out after 5 seconds.",
    });

    await vi.advanceTimersByTimeAsync(5_000);

    await expectation;
  });
});
