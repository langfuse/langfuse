import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  disableUiExports: undefined as "true" | "false" | undefined,
  cloudRegion: undefined as string | undefined,
  licenseKey: undefined as string | undefined,
}));

vi.mock("@/src/env.mjs", async (importOriginal) => {
  const original = (await importOriginal()) as { env: Record<string, unknown> };
  return {
    ...original,
    env: new Proxy(original.env, {
      get: (target, prop) => {
        if (prop === "LANGFUSE_DISABLE_UI_EXPORTS") {
          return mocks.disableUiExports;
        }
        return Reflect.get(target, prop);
      },
    }),
  };
});

vi.mock("@langfuse/shared/src/env", async (importOriginal) => {
  const original = (await importOriginal()) as { env: Record<string, unknown> };
  return {
    ...original,
    env: new Proxy(original.env, {
      get: (target, prop) => {
        if (prop === "NEXT_PUBLIC_LANGFUSE_CLOUD_REGION") {
          return mocks.cloudRegion;
        }
        if (prop === "LANGFUSE_EE_LICENSE_KEY") {
          return mocks.licenseKey;
        }
        return Reflect.get(target, prop);
      },
    }),
  };
});

import { isUiExportsDisabledByInstance } from "@/src/ee/features/ui-exports/server/uiExports";

describe("isUiExportsDisabledByInstance", () => {
  beforeEach(() => {
    mocks.disableUiExports = undefined;
    mocks.cloudRegion = undefined;
    mocks.licenseKey = undefined;
  });

  it("returns true only when LANGFUSE_DISABLE_UI_EXPORTS is true on a self-hosted enterprise instance", () => {
    mocks.disableUiExports = "true";
    mocks.licenseKey = "langfuse_ee_test";

    expect(isUiExportsDisabledByInstance()).toBe(true);
  });

  it("returns false when unlicensed, on a pro license, or when set to false", () => {
    mocks.disableUiExports = "true";
    expect(isUiExportsDisabledByInstance()).toBe(false);

    mocks.licenseKey = "langfuse_pro_test";
    expect(isUiExportsDisabledByInstance()).toBe(false);

    mocks.licenseKey = "langfuse_ee_test";
    mocks.disableUiExports = "false";
    expect(isUiExportsDisabledByInstance()).toBe(false);
  });
});
