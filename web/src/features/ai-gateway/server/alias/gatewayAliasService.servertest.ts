import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@langfuse/shared/src/db";

import type { OrgAuthedContext } from "@/src/server/api/trpc";
import {
  GatewayAliasService,
  upsertAliasInputSchema,
} from "./gatewayAliasService";

const { auditLog } = vi.hoisted(() => ({ auditLog: vi.fn() }));
vi.mock("@/src/features/audit-logs/server", () => ({ auditLog }));

const cleanupOrganizations: string[] = [];

afterEach(async () => {
  await prisma.organization.deleteMany({
    where: { id: { in: cleanupOrganizations.splice(0) } },
  });
  auditLog.mockReset();
});

async function prepare() {
  const org = await prisma.organization.create({
    data: { name: `Gateway alias audit ${randomUUID()}` },
  });
  cleanupOrganizations.push(org.id);
  const createConnection = (name: string) =>
    prisma.gatewayAiConnection.create({
      data: {
        organizationId: org.id,
        name,
        provider: "OPENAI",
        encryptedCredential: "",
        displaySecret: "sk-...test",
      },
    });
  return {
    org,
    first: await createConnection("first"),
    second: await createConnection("second"),
    session: { user: { id: "user-1" } } as OrgAuthedContext["session"],
  };
}

describe("GatewayAliasService audit log", () => {
  it("records the target list before and after re-pointing an alias", async () => {
    const { org, first, second, session } = await prepare();
    const service = new GatewayAliasService(prisma);
    const created = await service.upsert({
      organizationId: org.id,
      name: "glm-5.3",
      status: "ENABLED",
      targets: [{ connectionId: first.id, providerModel: "GLM-5.3" }],
      session,
    });

    await service.upsert({
      organizationId: org.id,
      id: created.id,
      name: "glm-5.3",
      status: "ENABLED",
      targets: [
        { connectionId: second.id, providerModel: "glm-5.3-fp8" },
        { connectionId: first.id, providerModel: "GLM-5.3" },
      ],
      session,
    });
    await service.delete({ organizationId: org.id, id: created.id, session });

    const [create, update, remove] = auditLog.mock.calls.map(([log]) => log);
    expect(create).toMatchObject({
      action: "create",
      after: {
        name: "glm-5.3",
        status: "ENABLED",
        targets: [
          { connectionId: first.id, providerModel: "GLM-5.3", position: 0 },
        ],
      },
    });
    expect(update).toMatchObject({
      action: "update",
      before: {
        targets: [
          { connectionId: first.id, providerModel: "GLM-5.3", position: 0 },
        ],
      },
      after: {
        targets: [
          {
            connectionId: second.id,
            providerModel: "glm-5.3-fp8",
            position: 0,
          },
          { connectionId: first.id, providerModel: "GLM-5.3", position: 1 },
        ],
      },
    });
    expect(remove).toMatchObject({
      action: "delete",
      before: {
        name: "glm-5.3",
        targets: [
          {
            connectionId: second.id,
            providerModel: "glm-5.3-fp8",
            position: 0,
          },
          { connectionId: first.id, providerModel: "GLM-5.3", position: 1 },
        ],
      },
    });
  });
});

describe("upsertAliasInputSchema", () => {
  it("rejects a target whose upstream model is blank", () => {
    const result = upsertAliasInputSchema.safeParse({
      organizationId: "org-1",
      name: "default-chat",
      targets: [{ connectionId: "connection-1", providerModel: "   " }],
    });
    expect(result.success).toBe(false);
  });
});
