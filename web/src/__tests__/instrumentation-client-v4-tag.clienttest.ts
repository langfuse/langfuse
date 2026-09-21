// @vitest-environment node

/**
 * Pageload transactions start at `Sentry.init`. Isolation-scope tags applied
 * after session hydrate miss that span. This guard imports the real
 * `web/instrumentation-client.ts` and asserts the cached v4 flag is applied
 * to the isolation scope before init.
 */

import {
  V4_BETA_ENABLED_SENTRY_TAG,
  V4_BETA_ENABLED_STORAGE_KEY,
} from "@/src/utils/sentryV4BetaTag";

const { initMock, setTagMock, callOrder } = vi.hoisted(() => {
  const callOrder: string[] = [];
  return {
    callOrder,
    initMock: vi.fn(() => {
      callOrder.push("init");
    }),
    setTagMock: vi.fn(() => {
      callOrder.push("setTag");
    }),
  };
});

vi.mock("@sentry/nextjs", () => ({
  init: initMock,
  replayIntegration: vi.fn(() => ({ name: "Replay" })),
  browserTracingIntegration: vi.fn(() => ({ name: "BrowserTracing" })),
  httpClientIntegration: vi.fn(() => ({ name: "HttpClient" })),
  captureConsoleIntegration: vi.fn(() => ({ name: "CaptureConsole" })),
  browserProfilingIntegration: vi.fn(() => ({ name: "BrowserProfiling" })),
  captureRouterTransitionStart: vi.fn(),
  setTag: setTagMock,
  getActiveSpan: vi.fn(),
  getRootSpan: vi.fn(),
}));

const memory = new Map<string, string>();

const localStorageMock = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memory.set(key, value);
  },
  removeItem: (key: string) => {
    memory.delete(key);
  },
};

async function loadInstrumentationClient() {
  vi.resetModules();
  initMock.mockClear();
  setTagMock.mockClear();
  callOrder.length = 0;
  vi.stubGlobal("window", { localStorage: localStorageMock });

  await import("@/instrumentation-client");
}

afterEach(() => {
  memory.clear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("instrumentation-client applies cached v4BetaEnabled before Sentry.init", () => {
  it("tags true from localStorage before init so pageload starts labeled", async () => {
    memory.set(V4_BETA_ENABLED_STORAGE_KEY, "true");

    await loadInstrumentationClient();

    expect(setTagMock).toHaveBeenCalledWith(V4_BETA_ENABLED_SENTRY_TAG, true);
    expect(initMock).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(["setTag", "init"]);
  });

  it("tags false from localStorage before init", async () => {
    memory.set(V4_BETA_ENABLED_STORAGE_KEY, "false");

    await loadInstrumentationClient();

    expect(setTagMock).toHaveBeenCalledWith(V4_BETA_ENABLED_SENTRY_TAG, false);
    expect(callOrder).toEqual(["setTag", "init"]);
  });

  it("does not guess false when the cache is missing", async () => {
    await loadInstrumentationClient();

    expect(setTagMock).not.toHaveBeenCalled();
    expect(initMock).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(["init"]);
  });
});
