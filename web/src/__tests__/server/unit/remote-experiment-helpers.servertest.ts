import { describe, expect, it } from "vitest";
import crypto from "crypto";
import { decrypt, encrypt } from "@langfuse/shared/encryption";
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
    expect(headers["Content-Type"]).toBe("application/json");
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
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["content-type"]).toBeUndefined();
    expect(headers["x-langfuse-signature"]).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
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
      secretKey: "encrypted-secret",
      displaySecretKey: "lf-whsec_...abcd",
    });

    expect(result.secretKey).toBe("encrypted-secret");
    expect(result.displaySecretKey).toBe("lf-whsec_...abcd");
    expect(result.unencryptedSecretKey).toBeUndefined();
  });

  it("generates an encrypted secret with masked display and a one-time plaintext", () => {
    const result = ensureRemoteExperimentSecret({
      secretKey: null,
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
