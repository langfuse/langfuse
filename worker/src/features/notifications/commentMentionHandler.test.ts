import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCommentFindFirst,
  mockGetUserProjectRoles,
  mockPreferenceFindMany,
  mockPreferenceFindUnique,
  mockSendCommentMentionEmail,
} = vi.hoisted(() => ({
  mockCommentFindFirst: vi.fn(),
  mockGetUserProjectRoles: vi.fn(),
  mockPreferenceFindMany: vi.fn(),
  mockPreferenceFindUnique: vi.fn(),
  mockSendCommentMentionEmail: vi.fn(),
}));

vi.mock("@langfuse/shared", () => ({
  Prisma: { empty: {} },
}));

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    comment: { findFirst: mockCommentFindFirst },
    notificationPreference: {
      findMany: mockPreferenceFindMany,
      findUnique: mockPreferenceFindUnique,
    },
  },
}));

vi.mock("@langfuse/shared/src/server", () => ({
  getObservationById: vi.fn(),
  getUserProjectRoles: mockGetUserProjectRoles,
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  sendCommentMentionEmail: mockSendCommentMentionEmail,
}));

vi.mock("../../env", () => ({
  env: {
    EMAIL_FROM_ADDRESS: "notifications@example.com",
    NEXTAUTH_URL: "https://example.com",
    SMTP_CONNECTION_URL: "smtp://example.com",
  },
}));

import { handleCommentMentionNotification } from "./commentMentionHandler";

describe("handleCommentMentionNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCommentFindFirst.mockResolvedValue({
      id: "comment-1",
      projectId: "project-1",
      objectType: "TRACE",
      objectId: "trace-1",
      content: "Hello @[Enabled User](user:user-enabled)",
      authorUserId: "author-1",
      project: {
        id: "project-1",
        name: "Project One",
        orgId: "org-1",
      },
    });
    mockGetUserProjectRoles.mockResolvedValue([
      { id: "author-1", name: "Author", email: "author@example.com" },
      {
        id: "user-enabled",
        name: "Enabled User",
        email: "enabled@example.com",
      },
      {
        id: "user-disabled",
        name: "Disabled User",
        email: "disabled@example.com",
      },
    ]);
    mockPreferenceFindMany.mockResolvedValue([
      { userId: "user-disabled", enabled: false },
    ]);
    mockPreferenceFindUnique.mockResolvedValue(undefined);
    mockSendCommentMentionEmail.mockResolvedValue(undefined);
  });

  it("fetches mention preferences once and preserves default-enabled behavior", async () => {
    await handleCommentMentionNotification({
      commentId: "comment-1",
      projectId: "project-1",
      mentionedUserIds: ["user-enabled", "user-disabled"],
    });

    expect(mockPreferenceFindMany).toHaveBeenCalledOnce();
    expect(mockPreferenceFindMany).toHaveBeenCalledWith({
      where: {
        projectId: "project-1",
        channel: "EMAIL",
        type: "COMMENT_MENTION",
        userId: { in: ["user-enabled", "user-disabled"] },
      },
      select: { userId: true, enabled: true },
    });
    expect(mockPreferenceFindUnique).not.toHaveBeenCalled();
    expect(mockSendCommentMentionEmail).toHaveBeenCalledOnce();
    expect(mockSendCommentMentionEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        mentionedUserEmail: "enabled@example.com",
      }),
    );
  });
});
