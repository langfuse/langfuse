import { describe, expect, it, vi } from "vitest";
import { type Prisma } from "@prisma/client";
import { InvalidRequestError } from "../../errors";

// Give createApiKey a SALT without depending on the ambient env.
vi.mock("../../env", () => ({ env: { SALT: "test-salt" } }));

import {
  createApiKey,
  formatSubmittedPublicKeyForLog,
  redactLangfuseSecretKeys,
} from "./apiKeys";
import {
  ApiKeyId,
  OrganizationId,
  ProjectId,
  SystemRoleId,
  UserId,
} from "../../features/rbac/types";

const SECRET_KEY = "sk-lf-0f2a4c6e-8b1d-4e3f-9a7c-5d6e7f8a9b0c";
const PUBLIC_KEY = "pk-lf-1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

describe("redactLangfuseSecretKeys", () => {
  it("masks a bare secret key to its display form", () => {
    expect(redactLangfuseSecretKeys(SECRET_KEY)).toBe("sk-lf-...9b0c");
  });

  it("masks every secret key embedded in a larger string", () => {
    const input = JSON.stringify([
      SECRET_KEY,
      PUBLIC_KEY,
      "sk-lf-gw-abcdef1234",
    ]);
    expect(redactLangfuseSecretKeys(input)).toBe(
      JSON.stringify(["sk-lf-...9b0c", PUBLIC_KEY, "sk-lf-...1234"]),
    );
  });

  it("leaves strings without a secret key unchanged", () => {
    expect(redactLangfuseSecretKeys(PUBLIC_KEY)).toBe(PUBLIC_KEY);
    expect(redactLangfuseSecretKeys("python-sdk 3.1.0")).toBe(
      "python-sdk 3.1.0",
    );
  });
});

describe("formatSubmittedPublicKeyForLog", () => {
  it("echoes a public key, quoted so it is delimited in the log line", () => {
    expect(formatSubmittedPublicKeyForLog(PUBLIC_KEY)).toBe(`"${PUBLIC_KEY}"`);
  });

  it("masks a secret key to its display form", () => {
    expect(formatSubmittedPublicKeyForLog(SECRET_KEY)).toBe('"sk-lf-...9b0c"');
  });

  it("masks non-Langfuse secrets without revealing their middle", () => {
    const openAiStyle = "sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    expect(formatSubmittedPublicKeyForLog(openAiStyle)).toBe('"sk-pro...6789"');
  });

  it("does not echo short values whose head and tail would overlap", () => {
    expect(formatSubmittedPublicKeyForLog("None")).toBe('"****"');
    expect(formatSubmittedPublicKeyForLog("")).toBe('"****"');
  });

  it("replaces characters outside printable ASCII", () => {
    expect(formatSubmittedPublicKeyForLog("pk-lf-a\nERROR forged")).toBe(
      '"pk-lf-a\uFFFDERROR forged"',
    );
    expect(formatSubmittedPublicKeyForLog("pk-lf-a\u001b[2Jb")).toBe(
      '"pk-lf-a\uFFFD[2Jb"',
    );
    expect(formatSubmittedPublicKeyForLog("pk-lf-a\u009bb")).toBe(
      '"pk-lf-a\uFFFDb"',
    );
  });

  it("escapes a quote or backslash so the value stays one token", () => {
    expect(formatSubmittedPublicKeyForLog('pk-lf-a" b\\c')).toBe(
      '"pk-lf-a\\" b\\\\c"',
    );
  });

  it("bounds the logged length", () => {
    const long = `pk-lf-${"a".repeat(500)}`;
    expect(formatSubmittedPublicKeyForLog(long)).toBe(`"${long.slice(0, 64)}"`);
  });
});

describe("createApiKey assignment rows", () => {
  const KEY_ID = "key_abc";
  const ORG_ID = "org_1";

  // A transaction-client double that records the api-key create input and the
  // assignment rows written and resolves a project's tenant, so the row-writing
  // contract can be asserted without a live database. Lacking `$transaction`, it
  // is treated as a joined transaction client, so createApiKey runs directly
  // against it.
  function makeTx() {
    const assignments: Array<{
      orgId: string;
      apiKeyId: string;
      principalId: string;
      ownerId: string;
      roleId: string;
      projectId: string | null;
      systemRole: string;
    }> = [];
    let apiKeyData: Record<string, unknown> = {};
    const tx = {
      $queryRaw: vi.fn(async () => [{ id: "proj_1" }]),
      apiKey: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          apiKeyData = data;
          return {
            id: KEY_ID,
            createdAt: new Date(),
            note: (data.note as string | null) ?? null,
            publicKey: data.publicKey,
            displaySecretKey: data.displaySecretKey,
          };
        }),
      },
      roleAssignment: {
        create: vi.fn(
          async ({ data }: { data: (typeof assignments)[number] }) => {
            assignments.push(data);
            return data;
          },
        ),
      },
      project: {
        findFirstOrThrow: vi.fn(async () => ({ orgId: ORG_ID })),
      },
    };
    return { tx, assignments, getApiKeyData: () => apiKeyData };
  }

  const asTx = (tx: ReturnType<typeof makeTx>["tx"]) =>
    tx as unknown as Prisma.TransactionClient;

  it("writes exactly one role@project row for a PROJECT-owner key", async () => {
    const { tx, assignments, getApiKeyData } = makeTx();

    await createApiKey(asTx(tx), {
      owner: ProjectId("proj_1"),
      role: SystemRoleId("VIEWER"),
      createdBy: UserId("user_1"),
      name: "project key",
    });

    expect(assignments).toEqual([
      {
        orgId: ORG_ID,
        apiKeyId: KEY_ID,
        principalId: ApiKeyId(KEY_ID),
        ownerId: ProjectId("proj_1"),
        roleId: SystemRoleId("VIEWER"),
        projectId: "proj_1",
        systemRole: "VIEWER",
      },
    ]);
    const data = getApiKeyData();
    expect(data.projectId).toBe("proj_1");
    expect(data.orgId).toBeUndefined();
    expect(data.note).toBe("project key");
    expect(data.createdByUserId).toBe("user_1");
    expect(data.createdByApiKeyId).toBeUndefined();
  });

  it("writes exactly one role@organization row for an ORGANIZATION-owner key", async () => {
    const { tx, assignments, getApiKeyData } = makeTx();

    await createApiKey(asTx(tx), {
      owner: OrganizationId(ORG_ID),
      role: SystemRoleId("LEGACY_ORGANIZATION_API_KEY"),
      createdBy: ApiKeyId("key_creator"),
      name: "org key",
    });

    expect(assignments).toEqual([
      {
        orgId: ORG_ID,
        apiKeyId: KEY_ID,
        principalId: ApiKeyId(KEY_ID),
        ownerId: OrganizationId(ORG_ID),
        roleId: SystemRoleId("LEGACY_ORGANIZATION_API_KEY"),
        projectId: null,
        systemRole: "LEGACY_ORGANIZATION_API_KEY",
      },
    ]);
    const data = getApiKeyData();
    expect(data.orgId).toBe(ORG_ID);
    expect(data.projectId).toBeUndefined();
    expect(data.createdByApiKeyId).toBe("key_creator");
    expect(data.createdByUserId).toBeUndefined();
    // An organization owner resolves to itself; no project lookup is needed.
    expect(tx.project.findFirstOrThrow).not.toHaveBeenCalled();
  });

  it.each(["legacy name", ""])(
    "accepts the deprecated note alias %j",
    async (note) => {
      const { tx, getApiKeyData } = makeTx();

      const result = await createApiKey(asTx(tx), {
        owner: OrganizationId(ORG_ID),
        role: SystemRoleId("LEGACY_ORGANIZATION_API_KEY"),
        createdBy: "system",
        note,
      });

      expect(getApiKeyData().note).toBe(note);
      expect(result.note).toBe(note);
    },
  );

  it.each([
    { name: "same", note: "same" },
    { name: "", note: "" },
    { name: "", note: "alias" },
    { name: "name", note: "" },
  ])(
    "rejects conflicting name and note inputs %j before writing",
    async (input) => {
      const { tx } = makeTx();

      await expect(
        createApiKey(asTx(tx), {
          owner: OrganizationId(ORG_ID),
          role: SystemRoleId("LEGACY_ORGANIZATION_API_KEY"),
          createdBy: "system",
          ...input,
        }),
      ).rejects.toThrow(InvalidRequestError);
      expect(tx.apiKey.create).not.toHaveBeenCalled();
      expect(tx.roleAssignment.create).not.toHaveBeenCalled();
    },
  );

  // createApiKey always enforces that the role can back a key: a user-only
  // role is rejected outright, and a project owner needs a project-capable
  // role. Legacy api-key roles remain valid.
  describe("role validation", () => {
    it("rejects a user-only role that cannot back an api key", async () => {
      const { tx, assignments } = makeTx();

      await expect(
        createApiKey(asTx(tx), {
          owner: OrganizationId(ORG_ID),
          role: SystemRoleId("OWNER"),
          createdBy: UserId("user_1"),
        }),
      ).rejects.toThrow(/cannot back an organization API key/);
      expect(assignments).toEqual([]);
    });

    it("rejects an org-only role on a project owner", async () => {
      const { tx, assignments } = makeTx();

      await expect(
        createApiKey(asTx(tx), {
          owner: ProjectId("proj_1"),
          role: SystemRoleId("AI_GATEWAY"),
          createdBy: UserId("user_1"),
        }),
      ).rejects.toThrow(/cannot back a project API key/);
      expect(assignments).toEqual([]);
    });
  });
});
