import { readdirSync } from "node:fs";
import path from "node:path";

import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";

import { env } from "@/src/env.mjs";
import { prisma } from "@langfuse/shared/src/db";
import {
  createAndAddApiKeysToDb,
  createBasicAuthHeader,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";

// Pins the project-route authorization seam to legacy: sweeps every project
// public-API route across migration modes and key kinds, recording each cell's
// status. Shadow/enforce must equal legacy (cross-mode); a main-captured
// snapshot pins legacy across the refactor (cross-branch). Value is status only.

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type Route = { route: string; methods: HttpMethod[] };

// Project routes under test, grouped by domain. `route` is the path under
// pages/api/public/ (import path + completeness key); `methods` are its real
// supported methods.
const projectRoutes: Route[] = [
  { route: "traces/index", methods: ["GET", "POST", "DELETE"] },
  { route: "traces/[traceId]", methods: ["GET", "DELETE"] },
  { route: "observations/index", methods: ["GET"] },
  { route: "observations/[observationId]", methods: ["GET"] },
  { route: "v2/observations/index", methods: ["GET"] },
  { route: "sessions/index", methods: ["GET"] },
  { route: "sessions/[sessionId]", methods: ["GET"] },
  { route: "scores/index", methods: ["GET", "POST"] },
  { route: "scores/[scoreId]", methods: ["GET", "DELETE"] },
  { route: "v2/scores/index", methods: ["GET"] },
  { route: "v2/scores/[scoreId]", methods: ["GET"] },
  { route: "v3/scores/index", methods: ["GET"] },
  { route: "score-configs/index", methods: ["GET", "POST"] },
  { route: "score-configs/[configId]", methods: ["GET", "PATCH"] },
  { route: "comments/index", methods: ["GET", "POST"] },
  { route: "comments/[commentId]", methods: ["GET"] },
  { route: "annotation-queues/index", methods: ["GET", "POST"] },
  { route: "annotation-queues/[queueId]/index", methods: ["GET"] },
  {
    route: "annotation-queues/[queueId]/assignments",
    methods: ["POST", "DELETE"],
  },
  {
    route: "annotation-queues/[queueId]/items/index",
    methods: ["GET", "POST"],
  },
  {
    route: "annotation-queues/[queueId]/items/[itemId]",
    methods: ["GET", "PATCH", "DELETE"],
  },
  { route: "datasets/index", methods: ["GET", "POST"] },
  { route: "datasets/[name]/index", methods: ["GET"] },
  { route: "datasets/[name]/runs/index", methods: ["GET"] },
  { route: "datasets/[name]/runs/[runName]", methods: ["GET", "DELETE"] },
  { route: "v2/datasets/index", methods: ["GET", "POST"] },
  { route: "v2/datasets/[datasetName]/index", methods: ["GET"] },
  { route: "dataset-items/index", methods: ["GET", "POST"] },
  { route: "dataset-items/[datasetItemId]", methods: ["GET", "DELETE"] },
  { route: "dataset-run-items", methods: ["GET", "POST"] },
  { route: "experiments/index", methods: ["GET"] },
  { route: "experiment-items/index", methods: ["GET"] },
  { route: "models/index", methods: ["GET", "POST"] },
  { route: "models/[modelId]/index", methods: ["GET", "PUT", "DELETE"] },
  { route: "media/index", methods: ["POST"] },
  { route: "media/[mediaId]", methods: ["GET", "PATCH"] },
  { route: "metrics/index", methods: ["GET"] },
  { route: "metrics/daily", methods: ["GET"] },
  { route: "v2/metrics", methods: ["GET"] },
  { route: "events", methods: ["POST"] },
  { route: "feedback", methods: ["POST"] },
  { route: "generations", methods: ["POST", "PATCH"] },
  { route: "spans", methods: ["POST", "PATCH"] },
  { route: "llm-connections/index", methods: ["GET", "PUT"] },
  { route: "llm-connections/[id]", methods: ["DELETE"] },
  { route: "unstable/dashboards/index", methods: ["GET", "POST"] },
  {
    route: "unstable/dashboards/[dashboardId]",
    methods: ["GET", "PATCH", "DELETE"],
  },
  {
    route: "unstable/dashboards/[dashboardId]/placements/index",
    methods: ["POST"],
  },
  {
    route: "unstable/dashboards/[dashboardId]/placements/[placementId]",
    methods: ["PATCH", "DELETE"],
  },
  { route: "unstable/dashboard-widgets/index", methods: ["GET", "POST"] },
  {
    route: "unstable/dashboard-widgets/[widgetId]",
    methods: ["GET", "PATCH", "DELETE"],
  },
  { route: "unstable/evaluators/index", methods: ["GET", "POST"] },
  { route: "unstable/evaluators/[evaluatorId]", methods: ["GET", "DELETE"] },
  { route: "unstable/evaluation-rules/index", methods: ["GET", "POST"] },
  {
    route: "unstable/evaluation-rules/[evaluationRuleId]",
    methods: ["GET", "PATCH", "DELETE"],
  },
  { route: "v2/evaluators/index", methods: ["GET", "POST"] },
  {
    route: "v2/evaluators/[evaluatorId]",
    methods: ["GET", "PATCH", "DELETE"],
  },
  { route: "v2/evaluators/[evaluatorId]/versions", methods: ["GET"] },
  { route: "v2/evaluation-rules/index", methods: ["GET", "POST"] },
  {
    route: "v2/evaluation-rules/[evaluationRuleId]",
    methods: ["GET", "PATCH", "DELETE"],
  },
];

// Non-project public files, subtracted from the filesystem walk before the
// completeness guard compares it to the table.
const denylistPrefixes = [
  "health", // liveness probe
  "ready", // readiness probe
  "ingestion", // batch ingestion, own auth path
  "prompts", // prompt handlers, own auth path
  "v2/prompts", // prompt list/name handlers, own auth path
  "mcp", // MCP server, own auth path
  "otel", // ingestion handlers read the raw request stream, not drivable via node-mocks-http
  "integrations", // blob-storage integration, own auth path
  "organizations", // organization-scoped, not project seam
  "projects", // organization-scoped, not project seam
  "scim", // SCIM, own auth path
  "slack", // Slack OAuth, own auth path
];

type ApiKeyKind = "org" | "project" | "agent" | "admin";
const apiKeyKinds: ApiKeyKind[] = ["org", "project", "agent", "admin"];

type MigrationMode = "legacy" | "shadow" | "enforce";

const adminApiKey = "test-admin-api-key-project-route-parity";
// Valid-shaped id that does not exist, so a good key lands past auth (404/400).
const nonexistentId = "00000000-0000-0000-0000-000000000000";

type KeyPair = { publicKey: string; secretKey: string };

const keys: Record<Exclude<ApiKeyKind, "admin">, KeyPair> = {
  org: { publicKey: "", secretKey: "" },
  project: { publicKey: "", secretKey: "" },
  agent: { publicKey: "", secretKey: "" },
};
let fixtureProjectId = "";

let originalMigration: string | undefined;
let originalAdminApiKey: string | undefined;
let matrices: Record<MigrationMode, Record<string, number>>;

/** queryForRoute maps each [param] path segment to a fixed nonexistent id, as Next populates req.query. */
function queryForRoute(route: string): Record<string, string> {
  const query: Record<string, string> = {};
  for (const match of route.matchAll(/\[([^\]]+)\]/g)) {
    query[match[1]!] = nonexistentId;
  }
  return query;
}

/** getHeaders derives a key kind's header sets: org/project/agent send basic + bearer, admin sends its single triple. */
function getHeaders(
  apiKeyKind: ApiKeyKind,
): { headerKind: string; headers: Record<string, string> }[] {
  if (apiKeyKind === "admin") {
    return [
      {
        headerKind: "admin",
        headers: {
          authorization: `Bearer ${adminApiKey}`,
          "x-langfuse-admin-api-key": adminApiKey,
          "x-langfuse-project-id": fixtureProjectId,
        },
      },
    ];
  }
  const { publicKey, secretKey } = keys[apiKeyKind];
  // An org key has no bound project, so a realistic org request names its target
  // via header; project/agent keys resolve their project from the key itself.
  const target =
    apiKeyKind === "org"
      ? { "x-langfuse-project-id": fixtureProjectId }
      : undefined;
  return [
    {
      headerKind: "basic",
      headers: {
        authorization: createBasicAuthHeader(publicKey, secretKey),
        ...target,
      },
    },
    {
      headerKind: "bearer",
      headers: { authorization: `Bearer ${publicKey}`, ...target },
    },
  ];
}

/** callRoute imports the route by convention and invokes its handler with a mocked request, returning the status code. */
async function callRoute(
  route: string,
  method: HttpMethod,
  headers: Record<string, string>,
): Promise<number> {
  const mod = await import(
    /* @vite-ignore */ `@/src/pages/api/public/${route}`
  );
  const handler = mod.default as (
    req: NextApiRequest,
    res: NextApiResponse,
  ) => Promise<void>;
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method,
    query: queryForRoute(route),
    body: method === "GET" ? undefined : {},
    headers,
  });
  await handler(req, res);
  return res._getStatusCode();
}

type Cell = { key: string; run: () => Promise<number> };

/** matrixCells lists every route × method × key kind × header kind cell in source order. */
function matrixCells(): Cell[] {
  const cells: Cell[] = [];
  for (const { route, methods } of projectRoutes) {
    for (const method of methods) {
      for (const apiKeyKind of apiKeyKinds) {
        for (const { headerKind, headers } of getHeaders(apiKeyKind)) {
          cells.push({
            key: `${method} ${route} | ${apiKeyKind}/${headerKind}`,
            run: () => callRoute(route, method, headers),
          });
        }
      }
    }
  }
  return cells;
}

/** runMatrix runs every cell in one mode with bounded concurrency, returning a flat status-by-cell map in source order. */
async function runMatrix(mode: MigrationMode): Promise<Record<string, number>> {
  (env as any).API_AUTH_MIGRATION = mode;
  const cells = matrixCells();
  const statuses = new Array<number>(cells.length);
  let next = 0;
  const worker = async () => {
    while (next < cells.length) {
      const index = next++;
      statuses[index] = await cells[index]!.run();
    }
  };
  await Promise.all(Array.from({ length: 16 }, worker));
  const result: Record<string, number> = {};
  cells.forEach((cell, index) => {
    result[cell.key] = statuses[index]!;
  });
  return result;
}

/** walkRoutes lists every route file under pages/api/public/ as a table-style route key. */
function walkRoutes(): string[] {
  const base = path.resolve(process.cwd(), "src/pages/api/public");
  const routes: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".ts")) {
        routes.push(
          path
            .relative(base, full)
            .replace(/\.ts$/, "")
            .split(path.sep)
            .join("/"),
        );
      }
    }
  };
  walk(base);
  return routes;
}

describe("project-route auth parity", () => {
  beforeAll(async () => {
    originalMigration = (env as any).API_AUTH_MIGRATION;
    originalAdminApiKey = (env as any).ADMIN_API_KEY;
    (env as any).ADMIN_API_KEY = adminApiKey;

    const base = await createOrgProjectAndApiKey();
    fixtureProjectId = base.projectId;
    keys.project = { publicKey: base.publicKey, secretKey: base.secretKey };

    const org = await createAndAddApiKeysToDb({
      prisma,
      entityId: base.orgId,
      scope: "ORGANIZATION",
    });
    keys.org = { publicKey: org.publicKey, secretKey: org.secretKey };

    const agent = await createAndAddApiKeysToDb({
      prisma,
      entityId: base.projectId,
      scope: "PROJECT",
      isInAppAgentKey: true,
    });
    keys.agent = { publicKey: agent.publicKey, secretKey: agent.secretKey };

    matrices = {
      legacy: await runMatrix("legacy"),
      shadow: await runMatrix("shadow"),
      enforce: await runMatrix("enforce"),
    };
  }, 120_000);

  afterAll(() => {
    (env as any).API_AUTH_MIGRATION = originalMigration;
    (env as any).ADMIN_API_KEY = originalAdminApiKey;
  });

  it("legacy matches the main-captured baseline", () => {
    expect(matrices.legacy).toMatchSnapshot();
  });

  it("shadow is byte-identical to legacy", () => {
    expect(matrices.shadow).toEqual(matrices.legacy);
  });

  it("enforce is byte-identical to legacy", () => {
    expect(matrices.enforce).toEqual(matrices.legacy);
  });

  it("covers every project route", () => {
    const denied = (route: string) =>
      denylistPrefixes.some(
        (prefix) => route === prefix || route.startsWith(`${prefix}/`),
      );
    const walked = new Set(walkRoutes().filter((route) => !denied(route)));
    const tabled = new Set(projectRoutes.map((r) => r.route));
    expect(walked).toEqual(tabled);
  });
});
