import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSendMail, mockCreateMailTransport } = vi.hoisted(() => {
  const mockSendMail = vi.fn();
  return {
    mockSendMail,
    mockCreateMailTransport: vi.fn(() => ({ sendMail: mockSendMail })),
  };
});

vi.mock("../transport", () => ({
  createMailTransport: mockCreateMailTransport,
}));

vi.mock("@react-email/render", () => ({
  render: vi.fn(async () => "<html>mention</html>"),
}));

vi.mock("./CommentMentionEmailTemplate", () => ({
  CommentMentionEmailTemplate: vi.fn(() => null),
}));

vi.mock("../../../logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

import { sendCommentMentionEmail } from "./sendCommentMentionEmail";

const params = {
  env: {
    EMAIL_FROM_ADDRESS: "noreply@example.com",
    SMTP_CONNECTION_URL: "smtp://localhost",
  },
  mentionedUserName: "Ada",
  mentionedUserEmail: "ada@example.com",
  authorName: "Bob",
  projectName: "Demo",
  commentPreview: "hello",
  commentLink: "https://example.com/comment",
  settingsLink: "https://example.com/settings",
};

describe("sendCommentMentionEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendMail.mockResolvedValue({});
    mockCreateMailTransport.mockReturnValue({ sendMail: mockSendMail });
  });

  it("returns delivered:true after sendMail succeeds", async () => {
    await expect(sendCommentMentionEmail(params)).resolves.toEqual({
      delivered: true,
    });
    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });

  it("returns delivered:false when SMTP env is missing", async () => {
    await expect(
      sendCommentMentionEmail({
        ...params,
        env: {},
      }),
    ).resolves.toEqual({ delivered: false });
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("rethrows SMTP failures so the mention job can retry", async () => {
    mockSendMail.mockRejectedValue(new Error("smtp timeout"));
    await expect(sendCommentMentionEmail(params)).rejects.toThrow(
      "smtp timeout",
    );
  });
});
