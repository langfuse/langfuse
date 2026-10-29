import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCommentFindFirst,
  mockPreferenceFindUnique,
  mockPreferenceFindMany,
  mockGetUserProjectRoles,
  mockSendCommentMentionEmail,
} = vi.hoisted(() => ({
  mockCommentFindFirst: vi.fn(),
  mockPreferenceFindUnique: vi.fn(),
  mockPreferenceFindMany: vi.fn(),
  mockGetUserProjectRoles: vi.fn(),
  mockSendCommentMentionEmail: vi.fn(),
}));

vi.mock("@langfuse/shared", () => ({
  Prisma: {
    empty: Symbol("empty"),
  },
}));

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    comment: {
      findFirst: mockCommentFindFirst,
    },
    notificationPreference: {
      findUnique: mockPreferenceFindUnique,
      findMany: mockPreferenceFindMany,
    },
    prompt: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@langfuse/shared/src/server", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  sendCommentMentionEmail: mockSendCommentMentionEmail,
  getObservationById: vi.fn(),
  getUserProjectRoles: mockGetUserProjectRoles,
}));

vi.mock("../../../env", () => ({
  env: {
    NEXTAUTH_URL: "http://localhost:3000",
    EMAIL_FROM_ADDRESS: "test@langfuse.com",
    SMTP_CONNECTION_URL: "smtp://localhost",
  },
}));

import { handleCommentMentionNotification } from "../commentMentionHandler";

const PROJECT_ID = "project-1";

const createComment = () => ({
  id: "comment-1",
  projectId: PROJECT_ID,
  authorUserId: "author-1",
  content: "hello @[User](user:user-1)",
  objectType: "TRACE",
  objectId: "trace-1",
  project: {
    id: PROJECT_ID,
    name: "Test Project",
    orgId: "org-1",
  },
});

const createUsers = (ids: string[]) =>
  ids.map((id) => ({
    id,
    name: `Name ${id}`,
    email: `${id}@example.com`,
  }));

describe("handleCommentMentionNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPreferenceFindUnique.mockResolvedValue(null);
    mockPreferenceFindMany.mockResolvedValue([]);
    mockSendCommentMentionEmail.mockResolvedValue(undefined);
  });

  it("fetches notification preferences in a single batched query instead of one query per mentioned user", async () => {
    const mentionedUserIds = ["user-1", "user-2", "user-3", "user-4", "user-5"];
    mockCommentFindFirst.mockResolvedValue(createComment());
    mockGetUserProjectRoles.mockResolvedValue(
      createUsers(["author-1", ...mentionedUserIds]),
    );

    await handleCommentMentionNotification({
      commentId: "comment-1",
      projectId: PROJECT_ID,
      mentionedUserIds,
    });

    // All mentioned users should receive an email (no disabled preferences)
    expect(mockSendCommentMentionEmail).toHaveBeenCalledTimes(
      mentionedUserIds.length,
    );

    // Preferences must be fetched in one batched query, not N per-user queries
    expect(mockPreferenceFindUnique).not.toHaveBeenCalled();
    expect(mockPreferenceFindMany).toHaveBeenCalledTimes(1);
    expect(mockPreferenceFindMany).toHaveBeenCalledWith({
      where: {
        projectId: PROJECT_ID,
        channel: "EMAIL",
        type: "COMMENT_MENTION",
        userId: { in: mentionedUserIds },
      },
    });
  });

  it("skips users with a disabled preference and defaults to enabled when no preference row exists", async () => {
    const mentionedUserIds = ["user-1", "user-2", "user-3"];
    mockCommentFindFirst.mockResolvedValue(createComment());
    mockGetUserProjectRoles.mockResolvedValue(
      createUsers(["author-1", ...mentionedUserIds]),
    );
    // user-2 disabled email notifications; user-1 has an explicit enabled row;
    // user-3 has no row at all (default: enabled)
    mockPreferenceFindMany.mockResolvedValue([
      { userId: "user-1", enabled: true },
      { userId: "user-2", enabled: false },
    ]);

    await handleCommentMentionNotification({
      commentId: "comment-1",
      projectId: PROJECT_ID,
      mentionedUserIds,
    });

    const emailedUsers = mockSendCommentMentionEmail.mock.calls.map(
      (call) => call[0].mentionedUserEmail,
    );
    expect(emailedUsers).toEqual(["user-1@example.com", "user-3@example.com"]);
  });

  it("does not email users who are not members of the project", async () => {
    mockCommentFindFirst.mockResolvedValue(createComment());
    // user-2 is mentioned but not a project member
    mockGetUserProjectRoles.mockResolvedValue(
      createUsers(["author-1", "user-1"]),
    );

    await handleCommentMentionNotification({
      commentId: "comment-1",
      projectId: PROJECT_ID,
      mentionedUserIds: ["user-1", "user-2"],
    });

    expect(mockSendCommentMentionEmail).toHaveBeenCalledTimes(1);
    expect(mockSendCommentMentionEmail).toHaveBeenCalledWith(
      expect.objectContaining({ mentionedUserEmail: "user-1@example.com" }),
    );
  });
});
