import { randomUUID } from "crypto";
import { describe, expect, it } from "vitest";

import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import {
  digestExecutionToken,
  executionPublicKey,
  IN_APP_AGENT_SCRIPT_EXECUTION_DEFAULT_LIMITS,
  InAppAgentRunStatus,
  InAppAgentScriptExecutionState,
} from "@langfuse/shared/in-app-agent";
import { authenticateSdkGatewayRequest } from "@/src/features/in-app-agent/server/sdkGateway/auth";
import { authorizeSdkGatewayOperation } from "@/src/features/in-app-agent/server/sdkGateway/policy";

describe("in-app agent SDK gateway auth", () => {
  const createExecution = async (params?: {
    role?: "ADMIN" | "VIEWER";
    deadlineAt?: Date;
    revoked?: boolean;
    token?: string;
  }) => {
    const setup = await createOrgProjectAndApiKey();
    const userId = `user-${randomUUID()}`;
    const token = params?.token ?? `token-${randomUUID()}`;
    const credentialId = randomUUID();
    const conversationId = `aconv_${randomUUID()}`;
    const waitingRunId = `arun_${randomUUID()}`;
    const executionId = randomUUID();

    await prisma.user.create({
      data: { id: userId, email: `${userId}@example.com` },
    });
    const orgMembership = await prisma.organizationMembership.create({
      data: { userId, orgId: setup.orgId, role: "MEMBER" },
    });
    await prisma.projectMembership.create({
      data: {
        userId,
        projectId: setup.projectId,
        orgMembershipId: orgMembership.id,
        role: params?.role ?? "ADMIN",
      },
    });
    await prisma.inAppAgentConversation.create({
      data: {
        id: conversationId,
        projectId: setup.projectId,
        createdByUserId: userId,
      },
    });
    await prisma.inAppAgentRun.create({
      data: {
        id: waitingRunId,
        projectId: setup.projectId,
        conversationId,
        triggeredByUserId: userId,
        status: InAppAgentRunStatus.WAITING_EXECUTION,
        request: {
          kind: "scriptExecution",
          parentRunId: waitingRunId,
          toolCallId: "tool-1",
          executionId,
          context: [],
        },
      },
    });
    await prisma.inAppAgentScriptExecution.create({
      data: {
        id: executionId,
        projectId: setup.projectId,
        conversationId,
        userId,
        parentRunId: waitingRunId,
        waitingRunId,
        toolCallId: "tool-1",
        script: "print(1)",
        scriptDigest: "digest",
        summary: "test",
        limits: IN_APP_AGENT_SCRIPT_EXECUTION_DEFAULT_LIMITS,
        deadlineAt: params?.deadlineAt ?? new Date(Date.now() + 60_000),
        state: InAppAgentScriptExecutionState.RUNNING,
        credentialId,
        tokenDigest: digestExecutionToken(token),
        tokenRevokedAt: params?.revoked ? new Date() : null,
      },
    });

    return { ...setup, userId, token, credentialId, executionId };
  };

  const authorization = (publicKey: string, secret: string) =>
    `Basic ${Buffer.from(`${publicKey}:${secret}`).toString("base64")}`;

  it("authenticates a live token and rejects expired, revoked, and unknown tokens", async () => {
    const live = await createExecution();
    const expired = await createExecution({
      deadlineAt: new Date(Date.now() - 1_000),
    });
    const revoked = await createExecution({ revoked: true });

    await expect(
      authenticateSdkGatewayRequest({
        authorization: authorization(
          executionPublicKey(live.credentialId),
          live.token,
        ),
      }),
    ).resolves.toMatchObject({
      executionId: live.executionId,
      projectId: live.projectId,
    });

    await expect(
      authenticateSdkGatewayRequest({
        authorization: authorization(
          executionPublicKey(expired.credentialId),
          expired.token,
        ),
      }),
    ).resolves.toBeUndefined();

    await expect(
      authenticateSdkGatewayRequest({
        authorization: authorization(
          executionPublicKey(revoked.credentialId),
          revoked.token,
        ),
      }),
    ).resolves.toBeUndefined();

    await expect(
      authenticateSdkGatewayRequest({
        authorization: authorization(executionPublicKey("missing"), "nope"),
      }),
    ).resolves.toBeUndefined();
  });

  it("fails closed after the initiating user loses project access", async () => {
    const live = await createExecution();
    await prisma.projectMembership.deleteMany({
      where: { userId: live.userId, projectId: live.projectId },
    });
    await prisma.organizationMembership.deleteMany({
      where: { userId: live.userId, orgId: live.orgId },
    });

    await expect(
      authenticateSdkGatewayRequest({
        authorization: authorization(
          executionPublicKey(live.credentialId),
          live.token,
        ),
      }),
    ).resolves.toBeUndefined();
  });

  it("denies a viewer for dataset writes and allows reads", async () => {
    const live = await createExecution({ role: "VIEWER" });
    const auth = await authenticateSdkGatewayRequest({
      authorization: authorization(
        executionPublicKey(live.credentialId),
        live.token,
      ),
    });

    expect(auth?.projectRole).toBe("VIEWER");
    expect(
      authorizeSdkGatewayOperation({
        operation: "datasets.write",
        projectRole: auth!.projectRole,
        isAdmin: auth!.isAdmin,
      }),
    ).toBe(false);
    expect(
      authorizeSdkGatewayOperation({
        operation: "datasets.read",
        projectRole: auth!.projectRole,
        isAdmin: auth!.isAdmin,
      }),
    ).toBe(true);
  });
});
