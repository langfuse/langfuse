import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";

import { env } from "@/src/env.mjs";
import { prisma } from "@langfuse/shared/src/db";
import {
  createAndAddApiKeysToDb,
  createBasicAuthHeader,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";

import mcpHandler from "@/src/pages/api/public/mcp";

// Sweeps the MCP endpoint's connection auth across migration modes and key
// kinds, recording each cell's status. Shadow and enforce must equal legacy
// (cross-mode); a captured snapshot pins legacy across the refactor. The MCP
// route resolves auth through shadowAuth before the transport, so a single POST
// initialize exercises the connection seam. Value is status only.
//
// Auth only ever emits 401/403, so a cell reading past auth carries a transport
// status instead: node-mocks-http cannot complete a streaming initialize, so an
// authenticated request lands on 400 here. The signal is 400 (past auth) vs
// 401/403 (denied); mcp-auth.servertest.ts covers the real 200 over fetch.

type ApiKeyKind = "project" | "agent" | "org" | "admin";
const apiKeyKinds: ApiKeyKind[] = ["project", "agent", "org", "admin"];

type MigrationMode = "legacy" | "shadow" | "enforce";
const migrationModes: MigrationMode[] = ["legacy", "shadow", "enforce"];

const adminApiKey = "test-admin-api-key-mcp-auth-parity";

type KeyPair = { publicKey: string; secretKey: string };

const keys: Record<Exclude<ApiKeyKind, "admin">, KeyPair> = {
  project: { publicKey: "", secretKey: "" },
  agent: { publicKey: "", secretKey: "" },
  org: { publicKey: "", secretKey: "" },
};
let fixtureProjectId = "";

let originalMigration: string | undefined;
let originalAdminApiKey: string | undefined;
let matrices: Record<MigrationMode, Record<string, number>>;

const initializeBody = {
  jsonrpc: "2.0",
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "parity", version: "1.0.0" },
  },
  id: 1,
};

const baseHeaders = {
  host: "localhost:3000",
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
};

/** getHeaders derives a key kind's header sets: project/agent/org send basic + bearer, admin sends its single triple. */
function getHeaders(
  apiKeyKind: ApiKeyKind,
): { headerKind: string; headers: Record<string, string> }[] {
  if (apiKeyKind === "admin") {
    return [
      {
        headerKind: "admin",
        headers: {
          ...baseHeaders,
          authorization: `Bearer ${adminApiKey}`,
          "x-langfuse-admin-api-key": adminApiKey,
          "x-langfuse-project-id": fixtureProjectId,
        },
      },
    ];
  }
  const { publicKey, secretKey } = keys[apiKeyKind];
  return [
    {
      headerKind: "basic",
      headers: {
        ...baseHeaders,
        authorization: createBasicAuthHeader(publicKey, secretKey),
      },
    },
    {
      headerKind: "bearer",
      headers: { ...baseHeaders, authorization: `Bearer ${publicKey}` },
    },
  ];
}

/** callMcp invokes the MCP route handler with a mocked POST initialize request, returning the status code. */
async function callMcp(headers: Record<string, string>): Promise<number> {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: "POST",
    body: initializeBody,
    headers,
  });
  await mcpHandler(req, res);
  return res._getStatusCode();
}

type Cell = { key: string; run: () => Promise<number> };

/** matrixCells lists every key kind × header kind cell in source order. */
function matrixCells(): Cell[] {
  const cells: Cell[] = [];
  for (const apiKeyKind of apiKeyKinds) {
    for (const { headerKind, headers } of getHeaders(apiKeyKind)) {
      cells.push({
        key: `${apiKeyKind}/${headerKind}`,
        run: () => callMcp(headers),
      });
    }
  }
  return cells;
}

/** runMatrix runs every cell in one mode, returning a flat status-by-cell map in source order. */
async function runMatrix(mode: MigrationMode): Promise<Record<string, number>> {
  (env as any).API_AUTH_MIGRATION = mode;
  const result: Record<string, number> = {};
  for (const cell of matrixCells()) {
    result[cell.key] = await cell.run();
  }
  return result;
}

describe("MCP connection auth parity", () => {
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

  it("legacy matches the captured baseline", () => {
    expect(matrices.legacy).toMatchSnapshot();
  });

  it.each(migrationModes.filter((mode) => mode !== "legacy"))(
    "%s is byte-identical to legacy",
    (mode) => {
      expect(matrices[mode]).toEqual(matrices.legacy);
    },
  );
});
