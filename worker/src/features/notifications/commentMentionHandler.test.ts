import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockRedis, mockSendCommentMentionEmail, mockGetUserProjectRoles } =
  vi.hoisted(() => ({
    mockRedis: {
      exists: vi.fn(),
      set: vi.fn(),
    },
    mockSendCommentMentionEmail: vi.fn(),
    mockGetUserProjectRoles: vi.fn(),
  }));

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
  },
}));

vi.mock("@langfuse/shared/src/server", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  redis: mockRedis,
  sendCommentMentionEmail: mockSendCommentMentionEmail,
  getObservationById: vi.fn(),
  getUserProjectRoles: mockGetUserProjectRoles,
}));

import { prisma } from "@langfuse/shared/src/db";
import {
  commentMentionSentRedisKey,
  COMMENT_MENTION_SENT_TTL_SECONDS,
  handleCommentMentionNotification,
} from "./commentMentionHandler";

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
    mockRedis.exists.mockResolvedValue(0);
    mockRedis.set.mockResolvedValue("OK");
    mockSendCommentMentionEmail.mockResolvedValue({ delivered: true });
    (
      prisma.notificationPreference.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValue(null);
    (prisma.comment.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      commentRow,
    );
    mockGetUserProjectRoles.mockResolvedValue([
      projectUser(userA, "a@example.com"),
      projectUser(userB, "b@example.com"),
      projectUser("author-1", "author@example.com"),
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("sends to every mentioned user and marks each send in Redis", async () => {
    await handleCommentMentionNotification({
      commentId,
      projectId,
      mentionedUserIds: [userA, userB],
    });

    expect(mockSendCommentMentionEmail).toHaveBeenCalledTimes(2);
    expect(mockRedis.set).toHaveBeenCalledWith(
      commentMentionSentRedisKey(commentId, userA),
      "1",
      "EX",
      COMMENT_MENTION_SENT_TTL_SECONDS,
    );
    expect(mockRedis.set).toHaveBeenCalledWith(
      commentMentionSentRedisKey(commentId, userB),
      "1",
      "EX",
      COMMENT_MENTION_SENT_TTL_SECONDS,
    );
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
    expect(mockRedis.set).toHaveBeenCalledTimes(1);
    expect(mockRedis.set).toHaveBeenCalledWith(
      commentMentionSentRedisKey(commentId, userB),
      "1",
      "EX",
      COMMENT_MENTION_SENT_TTL_SECONDS,
    );
  });

  it("skips recipients that already have a sent marker on redelivery", async () => {
    mockRedis.exists.mockImplementation(async (key: string) =>
      key === commentMentionSentRedisKey(commentId, userA) ? 1 : 0,
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
});
