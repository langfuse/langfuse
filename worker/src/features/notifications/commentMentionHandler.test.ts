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
      create: vi.fn(),
      deleteMany: vi.fn(),
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
      prisma.commentMentionEmail.create as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ id: "row-1" });
    (
      prisma.commentMentionEmail.deleteMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ count: 1 });
    mockGetUserProjectRoles.mockResolvedValue([
      projectUser(userA, "a@example.com"),
      projectUser(userB, "b@example.com"),
      projectUser("author-1", "author@example.com"),
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("claims the unique row before sending so concurrent jobs cannot both deliver", async () => {
    await handleCommentMentionNotification({
      commentId,
      projectId,
      mentionedUserIds: [userA, userB],
    });

    expect(prisma.commentMentionEmail.create).toHaveBeenCalledTimes(2);
    expect(prisma.commentMentionEmail.create).toHaveBeenCalledWith({
      data: { commentId, userId: userA },
    });
    expect(prisma.commentMentionEmail.create).toHaveBeenCalledWith({
      data: { commentId, userId: userB },
    });
    expect(mockSendCommentMentionEmail).toHaveBeenCalledTimes(2);
    expect(prisma.commentMentionEmail.deleteMany).not.toHaveBeenCalled();

    const createOrder = (
      prisma.commentMentionEmail.create as ReturnType<typeof vi.fn>
    ).mock.invocationCallOrder[0];
    const sendOrder = mockSendCommentMentionEmail.mock.invocationCallOrder[0];
    expect(createOrder).toBeLessThan(sendOrder);
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
    expect(prisma.commentMentionEmail.create).toHaveBeenCalledTimes(2);
    expect(prisma.commentMentionEmail.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.commentMentionEmail.deleteMany).toHaveBeenCalledWith({
      where: { commentId, userId: userA },
    });
  });

  it("skips recipients that already have a unique row on redelivery", async () => {
    (
      prisma.commentMentionEmail.create as ReturnType<typeof vi.fn>
    ).mockImplementation(
      async ({ data: { userId } }: { data: { userId: string } }) => {
        if (userId === userA) {
          throw { code: "P2002" };
        }
        return { id: "row-1" };
      },
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
    expect(prisma.commentMentionEmail.deleteMany).not.toHaveBeenCalled();
  });

  it("does not send when a concurrent job already inserted the unique row", async () => {
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

    expect(mockSendCommentMentionEmail).not.toHaveBeenCalled();
  });

  it("fails the job without sending when claiming the unique row fails", async () => {
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

    expect(mockSendCommentMentionEmail).not.toHaveBeenCalled();
  });

  it("releases the claim when SMTP reports the email was not delivered", async () => {
    mockSendCommentMentionEmail.mockResolvedValue({ delivered: false });

    await handleCommentMentionNotification({
      commentId,
      projectId,
      mentionedUserIds: [userA],
    });

    expect(prisma.commentMentionEmail.create).toHaveBeenCalledTimes(1);
    expect(prisma.commentMentionEmail.deleteMany).toHaveBeenCalledWith({
      where: { commentId, userId: userA },
    });
  });
});
