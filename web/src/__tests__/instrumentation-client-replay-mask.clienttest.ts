/**
 * HIPAA / non-EU-US Session Replay masking guard.
 *
 * All cloud regions (including HIPAA) report to the same US Sentry org.
 * The compliance safeguard for Session Replay is the region-gated
 * `maskAllText` / `blockAllMedia` configuration in
 * `web/instrumentation-client.ts`: replays are masked everywhere EXCEPT the
 * EU and US non-HIPAA cloud regions. Removing or weakening that gate would
 * ship unmasked replay of user content (prompts, traces, PII/PHI) from
 * HIPAA and other regions to Sentry.
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

type ReplayOptions = { maskAllText: boolean; blockAllMedia: boolean };

const { initMock, replayIntegrationMock, replaySentinel } = vi.hoisted(() => {
  const replaySentinel = { name: "Replay-sentinel" };
  return {
    initMock: vi.fn<(options: { integrations: unknown[] }) => void>(),
    replayIntegrationMock: vi.fn(
      (_options: { maskAllText: boolean; blockAllMedia: boolean }) =>
        replaySentinel,
    ),
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

describe("Session Replay masking is region-gated (compliance guard)", () => {
  // Regions that must ALWAYS be fully masked. `toStrictEqual` on the whole
  // options object is deliberate: any new replay option must be reviewed
  // here for its compliance impact before it can ship.
  const alwaysMaskedRegions: [string | undefined, string][] = [
    ["HIPAA", "the HIPAA cloud region"],
    ["JP", "a non-EU/US cloud region"],
    ["STAGING", "the staging environment"],
    ["DEV", "the dev environment"],
    [undefined, "self-hosted (region unset)"],
    ["", "an empty region value"],
    ["us", "a lowercase region value (gate must be exact-match)"],
  ];

  it.each(alwaysMaskedRegions)(
    "region %j (%s) gets maskAllText + blockAllMedia",
    async (region) => {
      await expect(loadReplayOptions(region)).resolves.toStrictEqual({
        maskAllText: true,
        blockAllMedia: true,
      });
    },
  );

  // The ONLY regions where unmasked replay is permitted. If this case starts
  // failing because masking became unconditional, that is a deliberate
  // product decision to confirm — not a bug in this test.
  it.each(["EU", "US"])(
    "only the %s cloud region may run unmasked replay",
    async (region) => {
      await expect(loadReplayOptions(region)).resolves.toStrictEqual({
        maskAllText: false,
        blockAllMedia: false,
      });
    },
  );
});
