import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findComment: vi.fn(),
  findPreferences: vi.fn(),
  findPreference: vi.fn(),
  getUserProjectRoles: vi.fn(),
  sendCommentMentionEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    comment: { findFirst: mocks.findComment },
    notificationPreference: {
      findMany: mocks.findPreferences,
      findUnique: mocks.findPreference,
    },
  },
}));

vi.mock("@langfuse/shared/src/server", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  sendCommentMentionEmail: mocks.sendCommentMentionEmail,
  getObservationById: vi.fn(),
  getUserProjectRoles: mocks.getUserProjectRoles,
}));

vi.mock("../../env", () => ({
  env: {
    NEXTAUTH_URL: "http://localhost:3000",
    EMAIL_FROM_ADDRESS: "noreply@example.com",
    SMTP_CONNECTION_URL: "smtp://localhost",
  },
}));

import { handleCommentMentionNotification } from "./commentMentionHandler";

const projectId = "project-1";
const mentionedUserIds = ["user-enabled", "user-disabled", "user-no-row"];

describe("handleCommentMentionNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.findComment.mockResolvedValue({
      id: "comment-1",
      projectId,
      authorUserId: "user-author",
      content: "Please look @[Ann](user:user-enabled)",
      objectType: "TRACE",
      objectId: "trace-1",
      project: { id: projectId, name: "Project", orgId: "org-1" },
    });

    mocks.getUserProjectRoles.mockResolvedValue([
      { id: "user-author", name: "Author", email: "author@example.com" },
      { id: "user-enabled", name: "Ann", email: "ann@example.com" },
      { id: "user-disabled", name: "Bob", email: "bob@example.com" },
      { id: "user-no-row", name: "Cid", email: "cid@example.com" },
    ]);

    mocks.findPreferences.mockResolvedValue([{ userId: "user-disabled" }]);
  });

  it("loads mention preferences in one query and skips only users who disabled them", async () => {
    await handleCommentMentionNotification({
      commentId: "comment-1",
      projectId,
      mentionedUserIds,
    });

    expect(mocks.findPreferences).toHaveBeenCalledTimes(1);
    expect(mocks.findPreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          projectId,
          userId: { in: mentionedUserIds },
          channel: "EMAIL",
          type: "COMMENT_MENTION",
          enabled: false,
        },
      }),
    );
    expect(mocks.findPreference).not.toHaveBeenCalled();

    const recipients = mocks.sendCommentMentionEmail.mock.calls.map(
      ([args]) => args.mentionedUserEmail,
    );
    expect(recipients).toEqual(["ann@example.com", "cid@example.com"]);
  });
});
