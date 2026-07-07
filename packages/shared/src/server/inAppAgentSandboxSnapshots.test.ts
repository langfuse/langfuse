import { describe, expect, it, vi } from "vitest";

import {
  clearExpiredInAppAgentProjectSandboxes,
  clearInAppAgentConversationSandbox,
} from "./inAppAgentSandboxSnapshots";

function createConversationPrismaMocks() {
  return {
    inAppAgentConversation: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  };
}

describe("inAppAgentSandboxSnapshots", () => {
  it("terminates the live session before clearing a conversation sandbox", async () => {
    const prisma = createConversationPrismaMocks();
    prisma.inAppAgentConversation.findUnique.mockResolvedValue({
      id: "conversation-1",
      projectId: "project-1",
      providerSessionId: "session-1",
      sandboxSnapshotKey: "snapshot-1",
      sandboxExpiresAt: new Date("2026-07-06T10:00:00.000Z"),
      sandboxProvider: "dangerous-docker",
    });
    prisma.inAppAgentConversation.update.mockResolvedValue(undefined);
    const deleteSnapshot = vi.fn().mockResolvedValue(undefined);

    await clearInAppAgentConversationSandbox({
      prisma,
      projectId: "project-1",
      conversationId: "conversation-1",
      deleteSnapshot,
    });

    expect(deleteSnapshot).toHaveBeenCalledWith({
      sandboxProvider: "dangerous-docker",
      sessionId: "session-1",
      snapshotKey: "snapshot-1",
    });
    expect(prisma.inAppAgentConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          providerSessionId: null,
          sandboxSnapshotKey: null,
          sandboxExpiresAt: null,
          sandboxProvider: null,
        },
      }),
    );
  });

  it("reaps expired sandbox sessions even without retention cutoff cleanup", async () => {
    const prisma = createConversationPrismaMocks();
    prisma.inAppAgentConversation.findMany.mockResolvedValue([
      {
        id: "conversation-1",
        projectId: "project-1",
        providerSessionId: "session-1",
        sandboxSnapshotKey: "snapshot-1",
        sandboxProvider: "lambda-microvm",
      },
    ]);
    prisma.inAppAgentConversation.updateMany.mockResolvedValue(undefined);
    const deleteSnapshot = vi.fn().mockResolvedValue(undefined);
    const now = new Date("2026-07-06T12:00:00.000Z");

    const clearedCount = await clearExpiredInAppAgentProjectSandboxes({
      prisma,
      projectId: "project-1",
      now,
      deleteSnapshot,
    });

    expect(clearedCount).toBe(1);
    expect(prisma.inAppAgentConversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          projectId: "project-1",
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([{ sandboxExpiresAt: { lt: now } }]),
            }),
          ]),
        }),
      }),
    );
    expect(deleteSnapshot).toHaveBeenCalledWith({
      sandboxProvider: "lambda-microvm",
      sessionId: "session-1",
      snapshotKey: "snapshot-1",
    });
    expect(prisma.inAppAgentConversation.updateMany).toHaveBeenCalled();
  });
});
