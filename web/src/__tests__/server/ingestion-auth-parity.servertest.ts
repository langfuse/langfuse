import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";

import { env } from "@/src/env.mjs";
import { prisma } from "@langfuse/shared/src/db";
import {
  createAndAddApiKeysToDb,
  createBasicAuthHeader,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";

import ingestionHandler from "@/src/pages/api/public/ingestion";

// Sweeps the ingestion endpoint's connection auth across migration modes and
// key kinds, recording each cell's status. Shadow and enforce must equal legacy
// (cross-mode); a captured snapshot pins legacy across the refactor. An empty
// batch resolves each request at the auth seam: a denied key carries 401/403,
// an authenticated key reaches the 207 the empty batch returns. Per-event authz
// (where enforce diverges) is exercised by shadowAuthorize's unit tests.

type ApiKeyKind = "project" | "agent" | "org";
const apiKeyKinds: ApiKeyKind[] = ["project", "agent", "org"];

type MigrationMode = "legacy" | "shadow" | "enforce";
const migrationModes: MigrationMode[] = ["legacy", "shadow", "enforce"];

type KeyPair = { publicKey: string; secretKey: string };

const keys: Record<ApiKeyKind, KeyPair> = {
  project: { publicKey: "", secretKey: "" },
  agent: { publicKey: "", secretKey: "" },
  org: { publicKey: "", secretKey: "" },
};

let originalMigration: string | undefined;
let matrices: Record<MigrationMode, Record<string, number>>;

const baseHeaders = {
  host: "localhost:3000",
  "content-type": "application/json",
};

/** getHeaders derives a key kind's header sets: each kind sends basic + bearer. */
function getHeaders(
  apiKeyKind: ApiKeyKind,
): { headerKind: string; headers: Record<string, string> }[] {
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

/** callIngestion invokes the ingestion route handler with an empty batch, returning the status code. */
async function callIngestion(headers: Record<string, string>): Promise<number> {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: "POST",
    body: { batch: [] },
    headers,
  });
  await ingestionHandler(req, res);
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
        run: () => callIngestion(headers),
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

describe("ingestion connection auth parity", () => {
  beforeAll(async () => {
    originalMigration = (env as any).API_AUTH_MIGRATION;

    const base = await createOrgProjectAndApiKey();
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
