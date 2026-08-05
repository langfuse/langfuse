import { randomUUID } from "crypto";
import { describe, expect, it } from "vitest";

import { InAppAgentRunStatus } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import {
  createInAppAgentConversationId,
  createInAppAgentRunId,
} from "@langfuse/shared/in-app-agent";

import { runInAppAgentCredentialMaintenance } from "./credentialMaintenance";

const ago = (ms: number) => new Date(Date.now() - ms);

async function seedProject() {
  const { projectId } = await createOrgProjectAndApiKey();
  const user = await prisma.user.create({
    data: { email: `cred-${randomUUID()}@langfuse.com`, name: "cred-user" },
  });

  return { projectId, userId: user.id };
}

async function seedAgentKey(projectId: string, createdAt: Date) {
  const suffix = randomUUID();

  return prisma.apiKey.create({
    data: {
      projectId,
      scope: "PROJECT",
      isInAppAgentKey: true,
      createdAt,
      publicKey: `pk-agent-${suffix}`,
      hashedSecretKey: `hsk-agent-${suffix}`,
      displaySecretKey: `sk-...${suffix.slice(0, 4)}`,
    },
  });
}

async function seedRun(
  ctx: { projectId: string; userId: string },
  data: {
    status: InAppAgentRunStatus;
    finishedAt: Date | null;
    mcpApiKeyId: string | null;
  },
) {
  const conversation = await prisma.inAppAgentConversation.create({
    data: {
      id: createInAppAgentConversationId(),
      projectId: ctx.projectId,
      createdByUserId: ctx.userId,
      title: "credential test",
    },
  });

  return prisma.inAppAgentRun.create({
    data: {
      id: createInAppAgentRunId(),
      projectId: ctx.projectId,
      conversationId: conversation.id,
      triggeredByUserId: ctx.userId,
      ...data,
    },
  });
}

const keyExists = async (id: string) =>
  (await prisma.apiKey.count({ where: { id } })) > 0;

const pointerOf = async (run: { id: string; projectId: string }) =>
  (
    await prisma.inAppAgentRun.findUniqueOrThrow({
      where: { id_projectId: { id: run.id, projectId: run.projectId } },
    })
  ).mcpApiKeyId;

describe("in-app agent credential maintenance", () => {
  it("revokes a terminal run's credential and clears its pointer", async () => {
    const ctx = await seedProject();
    // A worker that was SIGKILLed after minting leaves exactly this state, and
    // nothing else in the system will ever revisit it.
    const key = await seedAgentKey(ctx.projectId, ago(60_000));
    const run = await seedRun(ctx, {
      status: InAppAgentRunStatus.FAILED,
      finishedAt: ago(60_000),
      mcpApiKeyId: key.id,
    });

    await runInAppAgentCredentialMaintenance();

    expect(await keyExists(key.id)).toBe(false);
    expect(await pointerOf(run)).toBeNull();
  });

  it("clears the pointer when the credential is already gone", async () => {
    const ctx = await seedProject();
    const run = await seedRun(ctx, {
      status: InAppAgentRunStatus.SUCCEEDED,
      finishedAt: ago(60_000),
      // The delete landed but clearing the pointer did not; retrying must
      // finish the job rather than stall on a key that no longer exists.
      mcpApiKeyId: `missing-${randomUUID()}`,
    });

    await runInAppAgentCredentialMaintenance();

    expect(await pointerOf(run)).toBeNull();
  });

  it("reaps only unreferenced credentials older than the orphan window", async () => {
    const ctx = await seedProject();
    const orphaned = await seedAgentKey(ctx.projectId, ago(45 * 60_000));
    const young = await seedAgentKey(ctx.projectId, ago(60_000));
    const inUse = await seedAgentKey(ctx.projectId, ago(45 * 60_000));
    await seedRun(ctx, {
      status: InAppAgentRunStatus.RUNNING,
      finishedAt: null,
      mcpApiKeyId: inUse.id,
    });

    await runInAppAgentCredentialMaintenance();

    expect(await keyExists(orphaned.id)).toBe(false);
    expect(await keyExists(young.id)).toBe(true);
    // A run can legitimately outlive the age threshold; revoking under it
    // would break a live agent mid-turn.
    expect(await keyExists(inUse.id)).toBe(true);
  });
});
