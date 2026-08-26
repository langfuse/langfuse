import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockSendCommentMentionEmail, mockGetUserProjectRoles } = vi.hoisted(
  () => ({
    mockSendCommentMentionEmail: vi.fn(),
    mockGetUserProjectRoles: vi.fn(),
  }),
);

vi.mock("../../env", () => ({
  env: {
    NEXTAUTH_URL: "http://localhost:3000",
    EMAIL_FROM_ADDRESS: "noreply@example.com",
    SMTP_CONNECTION_URL: "smtp://localhost",
  },
}));

vi.mock("@langfuse/shared", () => ({
  Prisma: { empty: {} },
}));

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    comment: {
      findFirst: vi.fn(),
    },
    notificationPreference: {
      findUnique: vi.fn(),
    },
    commentMentionEmail: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("@langfuse/shared/src/server", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  sendCommentMentionEmail: mockSendCommentMentionEmail,
  getObservationById: vi.fn(),
  getUserProjectRoles: mockGetUserProjectRoles,
}));

import { prisma } from "@langfuse/shared/src/db";
import { handleCommentMentionNotification } from "./commentMentionHandler";

const commentId = "comment-1";
const projectId = "project-1";
const userA = "user-a";
const userB = "user-b";

const commentRow = {
  id: commentId,
  projectId,
  objectType: "TRACE",
  objectId: "trace-1",
  content: "Hey @[Ada](user:user-a) and @[Bob](user:user-b)",
  authorUserId: "author-1",
  project: { id: projectId, name: "Demo", orgId: "org-1" },
};

const projectUser = (id: string, email: string) => ({
  id,
  name: id,
  email,
});

describe("handleCommentMentionNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendCommentMentionEmail.mockResolvedValue({ delivered: true });
    (
      prisma.notificationPreference.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValue(null);
    (prisma.comment.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      commentRow,
    );
    (
      prisma.commentMentionEmail.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValue(null);
    (
      prisma.commentMentionEmail.create as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ id: "row-1" });
    mockGetUserProjectRoles.mockResolvedValue([
      projectUser(userA, "a@example.com"),
      projectUser(userB, "b@example.com"),
      projectUser("author-1", "author@example.com"),
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("sends to every mentioned user and records each send in Postgres", async () => {
    await handleCommentMentionNotification({
      commentId,
      projectId,
      mentionedUserIds: [userA, userB],
    });

    expect(mockSendCommentMentionEmail).toHaveBeenCalledTimes(2);
    expect(prisma.commentMentionEmail.create).toHaveBeenCalledWith({
      data: { commentId, userId: userA },
    });
    expect(prisma.commentMentionEmail.create).toHaveBeenCalledWith({
      data: { commentId, userId: userB },
    });
  });

  it("throws after the loop when one recipient fails so BullMQ can retry", async () => {
    mockSendCommentMentionEmail.mockImplementation(
      async ({ mentionedUserEmail }: { mentionedUserEmail: string }) => {
        if (mentionedUserEmail === "a@example.com") {
          throw new Error("smtp timeout");
        }
        return { delivered: true };
      },
    );

    await expect(
      handleCommentMentionNotification({
        commentId,
        projectId,
        mentionedUserIds: [userA, userB],
      }),
    ).rejects.toThrow(/user-a/);

    expect(mockSendCommentMentionEmail).toHaveBeenCalledTimes(2);
    expect(prisma.commentMentionEmail.create).toHaveBeenCalledTimes(1);
    expect(prisma.commentMentionEmail.create).toHaveBeenCalledWith({
      data: { commentId, userId: userB },
    });
  });

  it("skips recipients that already have a unique sent row on redelivery", async () => {
    (
      prisma.commentMentionEmail.findUnique as ReturnType<typeof vi.fn>
    ).mockImplementation(
      async ({
        where: {
          commentId_userId: { userId },
        },
      }: {
        where: { commentId_userId: { commentId: string; userId: string } };
      }) => (userId === userA ? { id: "existing" } : null),
    );

    await handleCommentMentionNotification({
      commentId,
      projectId,
      mentionedUserIds: [userA, userB],
    });

    expect(mockSendCommentMentionEmail).toHaveBeenCalledTimes(1);
    expect(mockSendCommentMentionEmail).toHaveBeenCalledWith(
      expect.objectContaining({ mentionedUserEmail: "b@example.com" }),
    );
  });

  it("does not fail the job when a concurrent retry already inserted the unique row", async () => {
    (
      prisma.commentMentionEmail.create as ReturnType<typeof vi.fn>
    ).mockRejectedValue({ code: "P2002" });

    await expect(
      handleCommentMentionNotification({
        commentId,
        projectId,
        mentionedUserIds: [userA],
      }),
    ).resolves.toBeUndefined();

    expect(mockSendCommentMentionEmail).toHaveBeenCalledTimes(1);
  });

  it("fails the job when recording the sent row fails for a non-unique error", async () => {
    (
      prisma.commentMentionEmail.create as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error("postgres down"));

    await expect(
      handleCommentMentionNotification({
        commentId,
        projectId,
        mentionedUserIds: [userA],
      }),
    ).rejects.toThrow(/user-a/);
  });
});
