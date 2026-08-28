// @vitest-environment node

import {
  V4_BETA_ENABLED_SENTRY_TAG,
  V4_BETA_ENABLED_STORAGE_KEY,
  applyCachedV4BetaEnabledSentryTag,
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

const memory = new Map<string, string>();

const localStorageMock = {
  getItem: vi.fn((key: string) => memory.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    memory.set(key, value);
  }),
  removeItem: vi.fn((key: string) => {
    memory.delete(key);
  }),
};

function stubLocalStorage() {
  memory.clear();
  localStorageMock.getItem.mockClear();
  localStorageMock.setItem.mockClear();
  localStorageMock.removeItem.mockClear();
  vi.stubGlobal("window", { localStorage: localStorageMock });
}

describe("setV4BetaEnabledSentryTag", () => {
  beforeEach(() => {
    setTagMock.mockClear();
    getActiveSpanMock.mockClear();
    getRootSpanMock.mockClear();
    setAttributeMock.mockClear();
    getRootSpanMock.mockReturnValue({ setAttribute: setAttributeMock });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

  it("persists true and false to localStorage for the next pageload", () => {
    stubLocalStorage();
    getActiveSpanMock.mockReturnValue(undefined);

    setV4BetaEnabledSentryTag(true);
    expect(memory.get(V4_BETA_ENABLED_STORAGE_KEY)).toBe("true");

    setV4BetaEnabledSentryTag(false);
    expect(memory.get(V4_BETA_ENABLED_STORAGE_KEY)).toBe("false");

    setV4BetaEnabledSentryTag(undefined);
    expect(memory.get(V4_BETA_ENABLED_STORAGE_KEY)).toBe("false");
  });

  it("still tags when localStorage writes throw", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("quota");
        },
        setItem: () => {
          throw new Error("quota");
        },
        removeItem: () => {
          throw new Error("quota");
        },
      },
    });
    getActiveSpanMock.mockReturnValue(undefined);

    expect(() => setV4BetaEnabledSentryTag(true)).not.toThrow();
    expect(setTagMock).toHaveBeenCalledWith(V4_BETA_ENABLED_SENTRY_TAG, true);
  });
});

describe("clearV4BetaEnabledSentryTag", () => {
  beforeEach(() => {
    setTagMock.mockClear();
    getActiveSpanMock.mockClear();
    getRootSpanMock.mockClear();
    setAttributeMock.mockClear();
    getRootSpanMock.mockReturnValue({ setAttribute: setAttributeMock });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("unsets the tag instead of labeling anonymous events as v3", () => {
    getActiveSpanMock.mockReturnValue(undefined);

    clearV4BetaEnabledSentryTag();

    expect(setTagMock).toHaveBeenCalledTimes(1);
    expect(setTagMock).toHaveBeenCalledWith(
      V4_BETA_ENABLED_SENTRY_TAG,
      undefined,
    );
  });

  it("removes the attribute from an in-flight root span on logout", () => {
    const childSpan = { name: "child" };
    getActiveSpanMock.mockReturnValue(childSpan);

    clearV4BetaEnabledSentryTag();

    expect(getRootSpanMock).toHaveBeenCalledWith(childSpan);
    expect(setAttributeMock).toHaveBeenCalledWith(
      V4_BETA_ENABLED_SENTRY_TAG,
      undefined,
    );
  });

  it("removes the cached flag so the next pageload is not labeled as v3", () => {
    stubLocalStorage();
    memory.set(V4_BETA_ENABLED_STORAGE_KEY, "true");
    getActiveSpanMock.mockReturnValue(undefined);

    clearV4BetaEnabledSentryTag();

    expect(memory.has(V4_BETA_ENABLED_STORAGE_KEY)).toBe(false);
  });
});

describe("applyCachedV4BetaEnabledSentryTag", () => {
  beforeEach(() => {
    setTagMock.mockClear();
    getActiveSpanMock.mockClear();
    getRootSpanMock.mockClear();
    setAttributeMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("tags true from cache without stamping a root span", () => {
    stubLocalStorage();
    memory.set(V4_BETA_ENABLED_STORAGE_KEY, "true");

    applyCachedV4BetaEnabledSentryTag();

    expect(setTagMock).toHaveBeenCalledTimes(1);
    expect(setTagMock).toHaveBeenCalledWith(V4_BETA_ENABLED_SENTRY_TAG, true);
    expect(getActiveSpanMock).not.toHaveBeenCalled();
  });

  it("tags false from cache", () => {
    stubLocalStorage();
    memory.set(V4_BETA_ENABLED_STORAGE_KEY, "false");

    applyCachedV4BetaEnabledSentryTag();

    expect(setTagMock).toHaveBeenCalledWith(V4_BETA_ENABLED_SENTRY_TAG, false);
  });

  it("does not tag when the cache is missing", () => {
    stubLocalStorage();

    applyCachedV4BetaEnabledSentryTag();

    expect(setTagMock).not.toHaveBeenCalled();
  });

  it("does not tag garbage cache values", () => {
    stubLocalStorage();
    memory.set(V4_BETA_ENABLED_STORAGE_KEY, "yes");

    applyCachedV4BetaEnabledSentryTag();

    expect(setTagMock).not.toHaveBeenCalled();
  });

  it("does not throw when localStorage is denied", () => {
    vi.stubGlobal("window", {
      get localStorage() {
        throw new Error(
          "Failed to read the 'localStorage' property from 'Window': Access is denied for this document.",
        );
      },
    });

    expect(() => applyCachedV4BetaEnabledSentryTag()).not.toThrow();
    expect(setTagMock).not.toHaveBeenCalled();
  });
});
