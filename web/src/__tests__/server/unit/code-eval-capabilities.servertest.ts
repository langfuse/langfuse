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
