import { afterEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import { decrypt, encrypt } from "@langfuse/shared/encryption";
import { LangfuseUserAgent } from "@langfuse/shared";
import { fetchWithSecureRedirects } from "@langfuse/shared/src/server";
import {
  buildRemoteExperimentRequest,
  ensureRemoteExperimentSecret,
  processRemoteExperimentHeaders,
} from "@/src/features/datasets/server/remoteExperimentHelpers";

describe("buildRemoteExperimentRequest", () => {
  const plaintextSecret = `lf-whsec_${"a".repeat(64)}`;

  it("signs the exact body with a webhook-compatible x-langfuse-signature header", () => {
    const { body, headers } = buildRemoteExperimentRequest({
      storedHeaders: {},
      encryptedSecretKey: encrypt(plaintextSecret),
      bodyObject: {
        projectId: "p1",
        datasetId: "d1",
        datasetName: "my-dataset",
        payload: { model: "gpt-4" },
      },
    });

    const match = headers["x-langfuse-signature"]?.match(
      /^t=(\d+),v1=([a-f0-9]{64})$/,
    );
    expect(match).not.toBeNull();

    // Receiver-side verification: HMAC-SHA256 over `${t}.${rawBody}` with the
    // shared secret must reproduce v1 exactly.
    const expected = crypto
      .createHmac("sha256", plaintextSecret)
      .update(`${match![1]}.${body}`, "utf8")
      .digest("hex");
    expect(match![2]).toBe(expected);
  });

  it("sends no signature header when no secret is configured (unsigned backward compat)", () => {
    const { body, headers } = buildRemoteExperimentRequest({
      storedHeaders: null,
      encryptedSecretKey: null,
      bodyObject: { projectId: "p1" },
    });

    expect(headers["x-langfuse-signature"]).toBeUndefined();
    expect(headers["content-type"]).toBe("application/json");
    expect(headers["user-agent"]).toBe(LangfuseUserAgent);
    expect(JSON.parse(body)).toEqual({ projectId: "p1" });
  });

  it("decrypts secret headers, passes plain headers through, and never lets stored headers override protected ones", () => {
    const { headers } = buildRemoteExperimentRequest({
      storedHeaders: {
        authorization: { secret: true, value: encrypt("Bearer token-123") },
        "x-environment": { secret: false, value: "production" },
        "content-type": { secret: false, value: "text/evil" },
        "x-langfuse-signature": { secret: false, value: "t=0,v1=forged" },
      },
      encryptedSecretKey: encrypt(plaintextSecret),
      bodyObject: { projectId: "p1" },
    });

    expect(headers["authorization"]).toBe("Bearer token-123");
    expect(headers["x-environment"]).toBe("production");
    expect(headers["content-type"]).toBe("application/json");
    expect(headers["user-agent"]).toBe(LangfuseUserAgent);
    expect(headers["x-langfuse-signature"]).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
  });

  it("reports secret custom headers as sensitive for redirect stripping", () => {
    const { sensitiveHeaderNames } = buildRemoteExperimentRequest({
      storedHeaders: {
        "x-api-key": { secret: true, value: encrypt("api-key-123") },
        "x-environment": { secret: false, value: "production" },
      },
      encryptedSecretKey: null,
      bodyObject: { projectId: "p1" },
    });

    expect(sensitiveHeaderNames).toEqual(["x-api-key"]);
  });

  it("drops headers with malformed encrypted values instead of throwing", () => {
    const { headers } = buildRemoteExperimentRequest({
      storedHeaders: {
        authorization: { secret: true, value: "not-valid-ciphertext" },
        "x-environment": { secret: false, value: "production" },
      },
      encryptedSecretKey: null,
      bodyObject: { projectId: "p1" },
    });

    expect(headers["authorization"]).toBeUndefined();
    expect(headers["x-environment"]).toBe("production");
  });
});

describe("remote experiment redirect handling", () => {
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);

  afterEach(() => {
    fetchMock.mockReset();
  });

  it("strips custom secret headers on cross-origin redirects when wired through additionalSensitiveHeaders", async () => {
    const { headers, sensitiveHeaderNames } = buildRemoteExperimentRequest({
      storedHeaders: {
        "x-api-key": { secret: true, value: encrypt("api-key-123") },
        "x-environment": { secret: false, value: "production" },
      },
      encryptedSecretKey: encrypt(`lf-whsec_${"a".repeat(64)}`),
      bodyObject: { projectId: "p1" },
    });

    fetchMock
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { Location: "https://other.example.com/final" },
        }),
      )
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    await fetchWithSecureRedirects(
      "https://example.com/start",
      { method: "POST", headers },
      {
        maxRedirects: 1,
        skipValidation: true,
        additionalSensitiveHeaders: sensitiveHeaderNames,
      },
    );

    const redirectedHeaders = new Headers(
      fetchMock.mock.calls[1]?.[1]?.headers,
    );
    expect(redirectedHeaders.get("x-api-key")).toBeNull();
    expect(redirectedHeaders.get("x-langfuse-signature")).toBeNull();
    expect(redirectedHeaders.get("x-environment")).toBe("production");
  });
});

describe("processRemoteExperimentHeaders", () => {
  it("encrypts secret values at rest and masks them in display headers", () => {
    const { requestHeaders, displayHeaders } = processRemoteExperimentHeaders(
      {
        authorization: { secret: true, value: "Bearer token-123" },
        "x-environment": { secret: false, value: "production" },
      },
      {},
    );

    expect(requestHeaders.authorization.value).not.toBe("Bearer token-123");
    expect(decrypt(requestHeaders.authorization.value)).toBe(
      "Bearer token-123",
    );
    expect(requestHeaders["x-environment"].value).toBe("production");

    expect(displayHeaders.authorization.value).toBe("Bear...-123");
    expect(displayHeaders.authorization.secret).toBe(true);
    expect(displayHeaders["x-environment"].value).toBe("production");
  });

  it("preserves the existing value when an empty value is submitted for a known header", () => {
    const existing = {
      authorization: { secret: true, value: encrypt("Bearer token-123") },
    };

    const { requestHeaders } = processRemoteExperimentHeaders(
      { authorization: { secret: true, value: "" } },
      existing,
    );

    expect(decrypt(requestHeaders.authorization.value)).toBe(
      "Bearer token-123",
    );
  });

  it("preserves all headers on undefined input and clears them on empty input", () => {
    const existing = {
      "x-environment": { secret: false, value: "production" },
    };

    expect(
      processRemoteExperimentHeaders(undefined, existing).requestHeaders,
    ).toEqual(existing);

    expect(processRemoteExperimentHeaders({}, existing).requestHeaders).toEqual(
      {},
    );
  });

  it("normalizes header names to lowercase and preserves existing values across casing changes", () => {
    const existing = {
      authorization: { secret: true, value: encrypt("Bearer token-123") },
    };

    // Same header resubmitted with different casing and an empty value must
    // still find and preserve the stored secret.
    const { requestHeaders, displayHeaders } = processRemoteExperimentHeaders(
      { Authorization: { secret: true, value: "" } },
      existing,
    );

    expect(Object.keys(requestHeaders)).toEqual(["authorization"]);
    expect(decrypt(requestHeaders.authorization.value)).toBe(
      "Bearer token-123",
    );
    expect(Object.keys(displayHeaders)).toEqual(["authorization"]);
  });

  it("rejects duplicate header names that differ only in casing", () => {
    expect(() =>
      processRemoteExperimentHeaders(
        {
          Authorization: { secret: false, value: "a" },
          authorization: { secret: false, value: "b" },
        },
        {},
      ),
    ).toThrow(/Duplicate header/);
  });

  it("rejects protected header names", () => {
    expect(() =>
      processRemoteExperimentHeaders(
        { "Content-Type": { secret: false, value: "text/plain" } },
        {},
      ),
    ).toThrow(/cannot be overridden/);

    expect(() =>
      processRemoteExperimentHeaders(
        { "X-Langfuse-Signature": { secret: false, value: "forged" } },
        {},
      ),
    ).toThrow(/cannot be overridden/);
  });

  it("rejects secret status changes without a value", () => {
    expect(() =>
      processRemoteExperimentHeaders(
        { "x-environment": { secret: true, value: "" } },
        { "x-environment": { secret: false, value: "production" } },
      ),
    ).toThrow(/secret status can only be changed/);

    expect(() =>
      processRemoteExperimentHeaders(
        { authorization: { secret: true, value: "" } },
        {},
      ),
    ).toThrow(/cannot be made secret without providing a value/);
  });
});

describe("ensureRemoteExperimentSecret", () => {
  it("keeps an existing secret and returns no one-time value", () => {
    const result = ensureRemoteExperimentSecret({
      displaySecretKey: "lf-whsec_...abcd",
    });

    expect(result.displaySecretKey).toBe("lf-whsec_...abcd");
    expect(result.secretKey).toBeUndefined();
    expect(result.unencryptedSecretKey).toBeUndefined();
  });

  it("generates an encrypted secret with masked display and a one-time plaintext", () => {
    const result = ensureRemoteExperimentSecret({
      displaySecretKey: null,
    });

    expect(result.unencryptedSecretKey).toMatch(/^lf-whsec_[a-f0-9]{64}$/);
    expect(result.secretKey).not.toBe(result.unencryptedSecretKey);
    expect(decrypt(result.secretKey)).toBe(result.unencryptedSecretKey);
    expect(result.displaySecretKey).toBe(
      `lf-whsec_...${result.unencryptedSecretKey!.slice(-4)}`,
    );
  });
});
