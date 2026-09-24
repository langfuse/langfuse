import { describe, expect, it } from "vitest";
import {
  formatSubmittedPublicKeyForLog,
  redactLangfuseSecretKeys,
} from "./apiKeys";

const SECRET_KEY = "sk-lf-0f2a4c6e-8b1d-4e3f-9a7c-5d6e7f8a9b0c";
const PUBLIC_KEY = "pk-lf-1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

describe("redactLangfuseSecretKeys", () => {
  it("masks a bare secret key to its display form", () => {
    expect(redactLangfuseSecretKeys(SECRET_KEY)).toBe("sk-lf-...9b0c");
  });

  it("masks every secret key embedded in a larger string", () => {
    const input = JSON.stringify([
      SECRET_KEY,
      PUBLIC_KEY,
      "sk-lf-gw-abcdef1234",
    ]);
    expect(redactLangfuseSecretKeys(input)).toBe(
      JSON.stringify(["sk-lf-...9b0c", PUBLIC_KEY, "sk-lf-...1234"]),
    );
  });

  it("leaves strings without a secret key unchanged", () => {
    expect(redactLangfuseSecretKeys(PUBLIC_KEY)).toBe(PUBLIC_KEY);
    expect(redactLangfuseSecretKeys("python-sdk 3.1.0")).toBe(
      "python-sdk 3.1.0",
    );
  });
});

describe("formatSubmittedPublicKeyForLog", () => {
  it("passes a public key through verbatim", () => {
    expect(formatSubmittedPublicKeyForLog(PUBLIC_KEY)).toBe(PUBLIC_KEY);
  });

  it("masks a secret key to its display form", () => {
    expect(formatSubmittedPublicKeyForLog(SECRET_KEY)).toBe("sk-lf-...9b0c");
  });

  it("masks non-Langfuse secrets without revealing their middle", () => {
    const openAiStyle = "sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    expect(formatSubmittedPublicKeyForLog(openAiStyle)).toBe("sk-pro...6789");
  });

  it("does not echo short values whose head and tail would overlap", () => {
    expect(formatSubmittedPublicKeyForLog("None")).toBe("****");
    expect(formatSubmittedPublicKeyForLog("")).toBe("****");
  });
});
