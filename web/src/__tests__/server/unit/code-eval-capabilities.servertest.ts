import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

async function getCapabilitiesForEnv(
  overrides: Record<string, string | undefined>,
) {
  vi.resetModules();

  process.env = { ...originalEnv };
  delete process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
  delete process.env.LANGFUSE_CODE_EVAL_DISPATCHER;

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  const { getCodeEvalCapabilities } =
    await import("@/src/features/evals/server/isCodeEvalEnabled");

  return getCodeEvalCapabilities();
}

afterEach(() => {
  vi.resetModules();
  process.env = { ...originalEnv };
});

describe("getCodeEvalCapabilities", () => {
  it("enables TypeScript and Python on cloud deployments", async () => {
    await expect(
      getCapabilitiesForEnv({ NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "US" }),
    ).resolves.toEqual({
      enabled: true,
      supportedSourceCodeLanguages: ["TYPESCRIPT", "PYTHON"],
    });
  });

  it("disables code evals for self-hosted deployments without a dispatcher", async () => {
    await expect(getCapabilitiesForEnv({})).resolves.toEqual({
      enabled: false,
      supportedSourceCodeLanguages: [],
    });
  });

  it("treats an empty cloud region as self-hosted", async () => {
    await expect(
      getCapabilitiesForEnv({
        NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "",
        LANGFUSE_CODE_EVAL_DISPATCHER: "insecure-local",
      }),
    ).resolves.toEqual({
      enabled: true,
      supportedSourceCodeLanguages: ["TYPESCRIPT"],
    });
  });

  it("enables TypeScript and Python for self-hosted aws-lambda dispatching", async () => {
    await expect(
      getCapabilitiesForEnv({ LANGFUSE_CODE_EVAL_DISPATCHER: "aws-lambda" }),
    ).resolves.toEqual({
      enabled: true,
      supportedSourceCodeLanguages: ["TYPESCRIPT", "PYTHON"],
    });
  });

  it("enables the configured languages for self-hosted external dispatching", async () => {
    await expect(
      getCapabilitiesForEnv({
        LANGFUSE_CODE_EVAL_DISPATCHER: "external",
        LANGFUSE_CODE_EVAL_EXTERNAL_ENDPOINT: "http://executor:8080/evaluate",
        LANGFUSE_CODE_EVAL_EXTERNAL_SIGNING_SECRET: "x".repeat(32),
        LANGFUSE_CODE_EVAL_EXTERNAL_LANGUAGES: "python",
      }),
    ).resolves.toEqual({
      enabled: true,
      supportedSourceCodeLanguages: ["PYTHON"],
    });
  });

  it("rejects the external dispatcher without a signing secret", async () => {
    await expect(
      getCapabilitiesForEnv({
        LANGFUSE_CODE_EVAL_DISPATCHER: "external",
        LANGFUSE_CODE_EVAL_EXTERNAL_ENDPOINT: "http://executor:8080/evaluate",
        LANGFUSE_CODE_EVAL_EXTERNAL_SIGNING_SECRET: undefined,
      }),
    ).rejects.toThrow("LANGFUSE_CODE_EVAL_EXTERNAL_SIGNING_SECRET");
  });

  it("rejects an external endpoint that dispatch-time validation would reject", async () => {
    await expect(
      getCapabilitiesForEnv({
        LANGFUSE_CODE_EVAL_DISPATCHER: "external",
        LANGFUSE_CODE_EVAL_EXTERNAL_ENDPOINT:
          "http://executor:8080/evaluate%E0%A4%A",
        LANGFUSE_CODE_EVAL_EXTERNAL_SIGNING_SECRET: "x".repeat(32),
      }),
    ).rejects.toThrow("LANGFUSE_CODE_EVAL_EXTERNAL_ENDPOINT");
  });

  it("enables only TypeScript for self-hosted insecure-local dispatching", async () => {
    await expect(
      getCapabilitiesForEnv({
        LANGFUSE_CODE_EVAL_DISPATCHER: "insecure-local",
      }),
    ).resolves.toEqual({
      enabled: true,
      supportedSourceCodeLanguages: ["TYPESCRIPT"],
    });
  });
});
