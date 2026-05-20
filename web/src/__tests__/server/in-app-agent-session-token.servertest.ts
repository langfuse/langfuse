import {
  InvalidInAppAgentSessionTokenError,
  signInAppAgentSessionToken,
  verifyInAppAgentSessionToken,
} from "@/src/features/in-app-agent/server/auth";

const tokenParams = {
  userId: "user-1",
  projectId: "project-1",
  threadId: "thread-1",
  claudeSessionId: "session-1",
  langfuseTraceId: "trace-1",
};

describe("in-app agent session tokens", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("signs and verifies a Claude session token", () => {
    const token = signInAppAgentSessionToken(tokenParams);

    expect(
      verifyInAppAgentSessionToken(token, {
        userId: tokenParams.userId,
        threadId: tokenParams.threadId,
      }),
    ).toEqual({
      projectId: tokenParams.projectId,
      claudeSessionId: tokenParams.claudeSessionId,
      langfuseTraceId: tokenParams.langfuseTraceId,
    });
  });

  it("rejects tokens for a different user or thread", () => {
    const token = signInAppAgentSessionToken(tokenParams);

    expect(() =>
      verifyInAppAgentSessionToken(token, {
        userId: "other-user",
        threadId: tokenParams.threadId,
      }),
    ).toThrow(InvalidInAppAgentSessionTokenError);
  });

  it("rejects tampered tokens", () => {
    const token = signInAppAgentSessionToken(tokenParams);

    expect(() =>
      verifyInAppAgentSessionToken(`${token}tampered`, {
        userId: tokenParams.userId,
        threadId: tokenParams.threadId,
      }),
    ).toThrow(InvalidInAppAgentSessionTokenError);
  });

  it("rejects expired tokens", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-13T00:00:00.000Z"));
    const token = signInAppAgentSessionToken(tokenParams);

    vi.setSystemTime(new Date("2026-05-21T00:00:00.000Z"));

    expect(() =>
      verifyInAppAgentSessionToken(token, {
        userId: tokenParams.userId,
        threadId: tokenParams.threadId,
      }),
    ).toThrow(InvalidInAppAgentSessionTokenError);
  });
});
