import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  licenseKey: undefined as string | undefined,
  telemetryEnabled: undefined as "true" | "false" | undefined,
  queryRaw: vi.fn(),
}));

// Spread the real env and override only what the telemetry gate reads, so the
// env -> plan -> entitlement chain runs unmocked.
vi.mock("@/src/env.mjs", async (importOriginal) => {
  const original = (await importOriginal()) as { env: Record<string, unknown> };
  return {
    ...original,
    env: new Proxy(original.env, {
      get: (target, prop) => {
        if (prop === "NEXT_PUBLIC_LANGFUSE_CLOUD_REGION") return undefined;
        if (prop === "TELEMETRY_ENABLED") return mocks.telemetryEnabled;
        if (prop === "LANGFUSE_EE_LICENSE_KEY") return mocks.licenseKey;
        return Reflect.get(target, prop);
      },
    }),
  };
});

// The first thing a telemetry run does past the gate is query the job
// schedule, so a call here means telemetry was not skipped.
vi.mock("@langfuse/shared/src/db", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  prisma: { $queryRaw: mocks.queryRaw },
}));

import { telemetry } from "@/src/features/telemetry";

describe("self-hosted telemetry", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CI", "");
    mocks.queryRaw.mockReset();
    mocks.queryRaw.mockRejectedValue(new Error("telemetry ran"));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    mocks.licenseKey = undefined;
    mocks.telemetryEnabled = undefined;
  });

  it.each([undefined, "true", "false"] as const)(
    "is skipped with a government license key and TELEMETRY_ENABLED=%s",
    async (telemetryEnabled) => {
      mocks.licenseKey = "lf_gov_test";
      mocks.telemetryEnabled = telemetryEnabled;

      await telemetry();

      expect(mocks.queryRaw).not.toHaveBeenCalled();
    },
  );

  it("is skipped without a license key and TELEMETRY_ENABLED=false", async () => {
    mocks.telemetryEnabled = "false";

    await telemetry();

    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });

  it.each([
    ["an enterprise", "langfuse_ee_test"],
    ["a pro", "langfuse_pro_test"],
  ])(
    "still runs with %s license key and TELEMETRY_ENABLED=false",
    async (_label, licenseKey) => {
      mocks.licenseKey = licenseKey;
      mocks.telemetryEnabled = "false";

      await telemetry();

      expect(mocks.queryRaw).toHaveBeenCalled();
    },
  );
});
