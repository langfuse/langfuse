import {
  clearProjectSdkVersionInfo,
  persistProjectSdkVersionInfo,
} from "@/src/features/sdk-version/lib/sdkVersionStorage";
import { sdkVersionStorageKeys } from "@/src/features/sdk-version/lib/sdkVersionCapabilities";

const storageValues = new Map<string, string>();
const localStorageMock: Storage = {
  get length() {
    return storageValues.size;
  },
  clear: () => storageValues.clear(),
  getItem: (key) => storageValues.get(key) ?? null,
  key: (index) => Array.from(storageValues.keys())[index] ?? null,
  removeItem: (key) => {
    storageValues.delete(key);
  },
  setItem: (key, value) => {
    storageValues.set(key, value);
  },
};

describe("SDK version storage", () => {
  beforeAll(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: localStorageMock,
    });
  });
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("caches an unknown result without stale language/version values", () => {
    const projectId = "project-1";
    const keys = sdkVersionStorageKeys(projectId);
    window.localStorage.setItem(keys.language, "javascript");
    window.localStorage.setItem(keys.version, "5.4.0");

    persistProjectSdkVersionInfo(
      projectId,
      { language: null, version: null },
      "2026-07-23T10:00:00.000Z",
    );

    expect(window.localStorage.getItem(keys.language)).toBeNull();
    expect(window.localStorage.getItem(keys.version)).toBeNull();
    expect(window.localStorage.getItem(keys.checkedAt)).toBe(
      "2026-07-23T10:00:00.000Z",
    );
  });

  it("clears all cached SDK detection values", () => {
    const keys = sdkVersionStorageKeys("project-1");
    persistProjectSdkVersionInfo(
      "project-1",
      { language: "javascript", version: "5.4.0" },
      "2026-07-23T10:00:00.000Z",
    );

    clearProjectSdkVersionInfo("project-1");

    expect(window.localStorage.getItem(keys.language)).toBeNull();
    expect(window.localStorage.getItem(keys.version)).toBeNull();
    expect(window.localStorage.getItem(keys.checkedAt)).toBeNull();
  });

  it("does not rewrite an unchanged SDK detection result", () => {
    const checkedAt = "2026-07-23T10:00:00.000Z";
    const sdkVersion = { language: "javascript", version: "5.4.0" };
    persistProjectSdkVersionInfo("project-1", sdkVersion, checkedAt);
    const setItem = vi.spyOn(window.localStorage, "setItem");

    persistProjectSdkVersionInfo("project-1", sdkVersion, checkedAt);

    expect(setItem).not.toHaveBeenCalled();
  });
});
