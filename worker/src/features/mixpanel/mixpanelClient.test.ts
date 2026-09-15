import { describe, it, expect, vi, beforeEach } from "vitest";

const { fetchWithSecureRedirects } = vi.hoisted(() => ({
  fetchWithSecureRedirects: vi.fn(),
}));

vi.mock("@langfuse/shared/src/server", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  fetchWithSecureRedirects,
}));

// Stubbed directly rather than through the real module, which pulls in
// validateWebhookURL/whitelistFromEnv from the mocked server barrel above.
vi.mock("../analyticsIntegrationEgress", () => ({
  buildAnalyticsRedirectOptions: () => ({
    maxRedirects: 10,
    redirectValidation: { validateUrl: () => {} },
  }),
  rethrowIfOutboundValidationFailure: () => undefined,
  // No-op: this suite is Mixpanel HTTP error handling, not URL policy.
  // Real IP-literal / credential / scheme coverage lives in
  // analyticsIntegrationOutboundUrlNegative.test.ts.
  validateAnalyticsIntegrationUrl: () => undefined,
}));

vi.mock("../../env", () => ({
  env: { LANGFUSE_MIXPANEL_TIMEOUT_MS: 5000 },
}));

import { MixpanelClient } from "./mixpanelClient";

const FAKE_PROJECT_TOKEN = "sk-mp-secret-token-abcdef123456";

const fakeResponse = (
  overrides: Partial<{
    ok: boolean;
    status: number;
    statusText: string;
    text: () => Promise<string>;
    json: () => Promise<unknown>;
  }>,
) => ({
  ok: true,
  status: 200,
  statusText: "OK",
  text: async () => "",
  json: async () => ({}),
  ...overrides,
});

const buildClient = () =>
  new MixpanelClient({ projectToken: FAKE_PROJECT_TOKEN, region: "api" });

const addOneEvent = (client: MixpanelClient) =>
  client.addEvent({
    event: "trace",
    properties: {
      time: Date.now(),
      distinct_id: "user-1",
      $insert_id: "insert-1",
    },
  });

describe("MixpanelClient.flush error handling", () => {
  beforeEach(() => {
    fetchWithSecureRedirects.mockReset();
  });

  it("throws on a 401 response with a plain, classifiable shape", async () => {
    fetchWithSecureRedirects.mockResolvedValue({
      response: fakeResponse({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => "unauthorized",
      }),
    });

    const client = buildClient();
    addOneEvent(client);

    await expect(client.flush()).rejects.toThrow(/401/);
  });

  it("resolves (does not throw) on a 400 with partial success", async () => {
    // Mixpanel's /import can report some records imported and some rejected
    // on a 400; only a zero-imported batch is a hard failure.
    fetchWithSecureRedirects.mockResolvedValue({
      response: fakeResponse({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        text: async () =>
          JSON.stringify({
            code: 400,
            num_records_imported: 1,
            failed_records: [
              { index: 1, insert_id: "x", field: "time", message: "bad" },
            ],
          }),
      }),
    });

    const client = buildClient();
    addOneEvent(client);

    await expect(client.flush()).resolves.toBeUndefined();
  });

  it("throws on a 400 where zero records were imported", async () => {
    fetchWithSecureRedirects.mockResolvedValue({
      response: fakeResponse({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        text: async () =>
          JSON.stringify({ code: 400, num_records_imported: 0 }),
      }),
    });

    const client = buildClient();
    addOneEvent(client);

    await expect(client.flush()).rejects.toThrow(/400/);
  });

  it("thrown message on a 401 carries neither the project token nor the response body", async () => {
    const responseBody = "leaky-response-body-marker";
    fetchWithSecureRedirects.mockResolvedValue({
      response: fakeResponse({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => responseBody,
      }),
    });

    const client = buildClient();
    addOneEvent(client);

    let caught: unknown;
    try {
      await client.flush();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).not.toContain(FAKE_PROJECT_TOKEN);
    expect(message).not.toContain(responseBody);
  });

  it("thrown message on a fully-rejected 400 carries neither the project token nor the response body", async () => {
    const failureDetail = "very-specific-field-validation-failure-detail";
    fetchWithSecureRedirects.mockResolvedValue({
      response: fakeResponse({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        text: async () =>
          JSON.stringify({
            code: 400,
            num_records_imported: 0,
            failed_records: [
              {
                index: 0,
                insert_id: "x",
                field: "time",
                message: failureDetail,
              },
            ],
          }),
      }),
    });

    const client = buildClient();
    addOneEvent(client);

    let caught: unknown;
    try {
      await client.flush();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).not.toContain(FAKE_PROJECT_TOKEN);
    expect(message).not.toContain(failureDetail);
  });
});
