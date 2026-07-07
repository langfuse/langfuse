import { describe, expect, it, vi } from "vitest";

import { clearInAppAgentConversationSandbox } from "./inAppAgentSandboxSnapshots";

function createConversationPrismaMocks() {
  return {
    inAppAgentConversation: {
      findUnique: vi.fn(),
      update: vi.fn(),
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
    const deleteSnapshot = vi.fn().mockResolvedValue({ skipped: false });

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
});
