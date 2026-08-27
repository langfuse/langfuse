// @vitest-environment node

/**
 * Session Replay masking guard.
 *
 * All cloud regions (including HIPAA) report to the same US Sentry org.
 * The compliance safeguard for Session Replay is the unconditional
 * `maskAllText` / `maskAllInputs` / `blockAllMedia` configuration in
 * `web/instrumentation-client.ts`: replays are masked in every deployment.
 * Removing or weakening that configuration would ship unmasked replay of
 * user content (prompts, traces, PII/PHI) to Sentry.
 *
 * Scope note: the mask covers Session Replay ONLY. Error-event payloads
 * (message, breadcrumbs, extra, tags) are never masked — for those, the
 * capture-contract rule "no user content in messages/extra/tags" (skill
 * rule 7) is the compliance boundary.
 *
 * These tests import the REAL `web/instrumentation-client.ts` module (the
 * file Next.js executes in the browser) with `@sentry/nextjs` mocked, and
 * assert on the arguments Sentry actually receives. They intentionally do
 * NOT test a copy of the config or an exported predicate: if the replay
 * options move, stop flowing into `Sentry.init`, or change values, these
 * tests fail. If this file fails after an instrumentation change, the
 * change weakens the compliance mask — fix the change, not the test.
 */

type ReplayOptions = {
  maskAllText: boolean;
  maskAllInputs: boolean;
  blockAllMedia: boolean;
};

const { initMock, replayIntegrationMock, replaySentinel } = vi.hoisted(() => {
  const replaySentinel = { name: "Replay-sentinel" };
  return {
    initMock: vi.fn<(options: { integrations: unknown[] }) => void>(),
    replayIntegrationMock: vi.fn((_options: ReplayOptions) => replaySentinel),
    replaySentinel,
  };
});

vi.mock("@sentry/nextjs", () => ({
  init: initMock,
  replayIntegration: replayIntegrationMock,
  browserTracingIntegration: vi.fn(() => ({ name: "BrowserTracing" })),
  httpClientIntegration: vi.fn(() => ({ name: "HttpClient" })),
  captureConsoleIntegration: vi.fn(() => ({ name: "CaptureConsole" })),
  browserProfilingIntegration: vi.fn(() => ({ name: "BrowserProfiling" })),
  captureRouterTransitionStart: vi.fn(),
  setTag: vi.fn(),
  getActiveSpan: vi.fn(),
  getRootSpan: vi.fn(),
}));

/**
 * Executes the real instrumentation-client module under the given cloud
 * region and returns the options `Sentry.replayIntegration` was called with.
 * Also asserts the resulting integration instance is actually wired into
 * `Sentry.init` — a replay integration that is configured but never passed
 * to init would silently disable replay instead of masking it.
 */
async function loadReplayOptions(
  region: string | undefined,
): Promise<ReplayOptions> {
  vi.resetModules();
  initMock.mockClear();
  replayIntegrationMock.mockClear();
  vi.stubEnv("NEXT_PUBLIC_LANGFUSE_CLOUD_REGION", region);

  await import("@/instrumentation-client");

  expect(initMock).toHaveBeenCalledTimes(1);
  expect(replayIntegrationMock).toHaveBeenCalledTimes(1);
  expect(initMock.mock.calls[0]![0].integrations).toContain(replaySentinel);

  return replayIntegrationMock.mock.calls[0]![0]!;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Session Replay masking is unconditional (compliance guard)", () => {
  // Every region must be fully masked. `toStrictEqual` on the whole
  // options object is deliberate: any new replay option must be reviewed
  // here for its compliance impact before it can ship.
  const regions: [string | undefined, string][] = [
    ["EU", "the EU cloud region"],
    ["US", "the US cloud region"],
    ["HIPAA", "the HIPAA cloud region"],
    ["JP", "a non-EU/US cloud region"],
    ["STAGING", "the staging environment"],
    ["DEV", "the dev environment"],
    [undefined, "self-hosted (region unset)"],
    ["", "an empty region value"],
    ["us", "a lowercase region value"],
  ];

  it.each(regions)(
    "region %j (%s) gets text, input, and media masking",
    async (region) => {
      await expect(loadReplayOptions(region)).resolves.toStrictEqual({
        maskAllText: true,
        maskAllInputs: true,
        blockAllMedia: true,
      });
    },
  );
});
