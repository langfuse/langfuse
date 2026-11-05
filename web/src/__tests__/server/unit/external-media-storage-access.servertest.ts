import { type Organization } from "@langfuse/shared/src/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cloudRegion: undefined as string | undefined,
  licenseKey: undefined as string | undefined,
  allowlist: [] as string[],
}));

// Override only the values the gate reads, so the real
// env -> plan -> entitlement chain runs.
vi.mock("@/src/env.mjs", async (importOriginal) => {
  const original = (await importOriginal()) as { env: Record<string, unknown> };
  return {
    ...original,
    env: new Proxy(original.env, {
      get: (target, prop) => {
        if (prop === "NEXT_PUBLIC_LANGFUSE_CLOUD_REGION")
          return mocks.cloudRegion;
        if (prop === "LANGFUSE_EE_LICENSE_KEY") return mocks.licenseKey;
        if (
          prop === "LANGFUSE_EXTERNAL_MEDIA_STORAGE_ORGANIZATION_ID_ALLOWLIST"
        )
          return mocks.allowlist;
        return Reflect.get(target, prop);
      },
    }),
  };
});

import { hasExternalMediaStorageAccess } from "@/src/ee/features/external-media-storage/server/hasExternalMediaStorageAccess";

const organization = (cloudConfig: unknown = null) =>
  ({ id: "org-allowlisted", cloudConfig }) as Organization;

function setCloudRegion(region: string | undefined) {
  mocks.cloudRegion = region;
  // The plan resolver reads the region from process.env directly.
  vi.stubEnv("NEXT_PUBLIC_LANGFUSE_CLOUD_REGION", region ?? "");
}

describe("hasExternalMediaStorageAccess", () => {
  beforeEach(() => {
    setCloudRegion(undefined);
    mocks.licenseKey = undefined;
    mocks.allowlist = ["org-allowlisted"];
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("grants Cloud access to enterprise plans and allowlisted organizations only", () => {
    setCloudRegion("EU");
    expect(hasExternalMediaStorageAccess(organization({ plan: "Pro" }))).toBe(
      true,
    );

    mocks.allowlist = [];
    expect(
      hasExternalMediaStorageAccess(organization({ plan: "Enterprise" })),
    ).toBe(true);
    expect(hasExternalMediaStorageAccess(organization({ plan: "Pro" }))).toBe(
      false,
    );
  });

  it("ignores the allowlist on self-hosted deployments without an enterprise license", () => {
    expect(hasExternalMediaStorageAccess(organization())).toBe(false);

    mocks.licenseKey = "langfuse_ee_test";
    expect(hasExternalMediaStorageAccess(organization())).toBe(true);
  });
});
