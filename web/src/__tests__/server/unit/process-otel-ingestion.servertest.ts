import { describe, expect, it } from "vitest";

import {
  processOtelIngestion,
  type OtelIngestionRequest,
} from "@/src/server/otel/processOtelIngestion";

const config = {
  projectId: "project-id",
  publicKey: "public-key",
  sdkName: "test-sdk",
  sdkVersion: "1.0.0",
};

function processRequest(
  request: Omit<OtelIngestionRequest, "encodedBodyBytes">,
) {
  return processOtelIngestion({
    ...request,
    encodedBodyBytes: request.body.byteLength,
  });
}

describe("processOtelIngestion", () => {
  it("preserves the invalid content type response", async () => {
    await expect(
      processRequest({
        body: Buffer.from("{}"),
        contentType: "text/plain",
        config,
      }),
    ).resolves.toEqual({
      kind: "http",
      status: 400,
      body: { error: "Invalid content type" },
    });
  });

  it("preserves the malformed JSON response", async () => {
    await expect(
      processRequest({
        body: Buffer.from("{"),
        contentType: "application/json",
        config,
      }),
    ).resolves.toEqual({
      kind: "http",
      status: 400,
      body: { error: "Failed to parse OTel JSON Trace" },
    });
  });

  it("rejects spans that cannot be processed", async () => {
    await expect(
      processRequest({
        body: Buffer.from(
          JSON.stringify({
            resourceSpans: [
              {
                scopeSpans: [
                  {
                    scope: { name: "test-scope" },
                    spans: [{ name: "missing-ids" }],
                  },
                ],
              },
            ],
          }),
        ),
        contentType: "application/json",
        config,
      }),
    ).resolves.toMatchObject({
      kind: "http",
      status: 400,
      body: {
        error: expect.stringContaining("Invalid OTLP trace export"),
      },
    });
  });

  it("skips an empty export", async () => {
    await expect(
      processRequest({
        body: Buffer.from('{"resourceSpans":[]}'),
        contentType: "application/json",
        config,
      }),
    ).resolves.toEqual({ kind: "ok" });
  });
});
