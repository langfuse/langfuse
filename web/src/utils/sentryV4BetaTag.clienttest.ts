// @vitest-environment node

import {
  V4_BETA_ENABLED_SENTRY_TAG,
  clearV4BetaEnabledSentryTag,
  setV4BetaEnabledSentryTag,
} from "@/src/utils/sentryV4BetaTag";

const { setTagMock, getActiveSpanMock, getRootSpanMock, setAttributeMock } =
  vi.hoisted(() => ({
    setTagMock: vi.fn(),
    getActiveSpanMock: vi.fn(),
    getRootSpanMock: vi.fn(),
    setAttributeMock: vi.fn(),
  }));

vi.mock("@sentry/nextjs", () => ({
  setTag: setTagMock,
  getActiveSpan: getActiveSpanMock,
  getRootSpan: getRootSpanMock,
}));

describe("setV4BetaEnabledSentryTag", () => {
  beforeEach(() => {
    setTagMock.mockClear();
    getActiveSpanMock.mockClear();
    getRootSpanMock.mockClear();
    setAttributeMock.mockClear();
    getRootSpanMock.mockReturnValue({ setAttribute: setAttributeMock });
  });

  it("sets a boolean true tag without user or project ids", () => {
    getActiveSpanMock.mockReturnValue(undefined);

    setV4BetaEnabledSentryTag(true);

    expect(setTagMock).toHaveBeenCalledTimes(1);
    expect(setTagMock).toHaveBeenCalledWith("v4BetaEnabled", true);
    expect(typeof setTagMock.mock.calls[0]![1]).toBe("boolean");
  });

  it("coerces missing / false session values to boolean false", () => {
    getActiveSpanMock.mockReturnValue(undefined);

    setV4BetaEnabledSentryTag(false);
    setV4BetaEnabledSentryTag(undefined);

    expect(setTagMock).toHaveBeenNthCalledWith(
      1,
      V4_BETA_ENABLED_SENTRY_TAG,
      false,
    );
    expect(setTagMock).toHaveBeenNthCalledWith(
      2,
      V4_BETA_ENABLED_SENTRY_TAG,
      false,
    );
  });

  it("stamps the in-flight root span so pageload spans pick up the tag after hydrate", () => {
    const childSpan = { name: "child" };
    getActiveSpanMock.mockReturnValue(childSpan);

    setV4BetaEnabledSentryTag(true);

    expect(getRootSpanMock).toHaveBeenCalledWith(childSpan);
    expect(setAttributeMock).toHaveBeenCalledWith(
      V4_BETA_ENABLED_SENTRY_TAG,
      true,
    );
  });

  it("skips span stamping when no pageload/navigation span is active", () => {
    getActiveSpanMock.mockReturnValue(undefined);

    setV4BetaEnabledSentryTag(true);

    expect(getRootSpanMock).not.toHaveBeenCalled();
    expect(setAttributeMock).not.toHaveBeenCalled();
  });
});

describe("clearV4BetaEnabledSentryTag", () => {
  beforeEach(() => {
    setTagMock.mockClear();
  });

  it("unsets the tag instead of labeling anonymous events as v3", () => {
    clearV4BetaEnabledSentryTag();

    expect(setTagMock).toHaveBeenCalledTimes(1);
    expect(setTagMock).toHaveBeenCalledWith(
      V4_BETA_ENABLED_SENTRY_TAG,
      undefined,
    );
  });
});
