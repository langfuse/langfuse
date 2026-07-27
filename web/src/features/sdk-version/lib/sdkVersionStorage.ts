import {
  sdkVersionStorageKeys,
  type SdkVersionInfo,
} from "@/src/features/sdk-version/lib/sdkVersionCapabilities";

const writeStorageValue = (key: string, value: string | null) => {
  if (value === null) {
    window.localStorage.removeItem(key);
  } else {
    window.localStorage.setItem(key, value);
  }
};

export const persistProjectSdkVersionInfo = (
  projectId: string,
  sdkVersion: SdkVersionInfo,
  checkedAt: string,
) => {
  if (typeof window === "undefined") return;

  const keys = sdkVersionStorageKeys(projectId);
  try {
    if (window.localStorage.getItem(keys.checkedAt) === checkedAt) return;

    writeStorageValue(keys.language, sdkVersion.language);
    writeStorageValue(keys.version, sdkVersion.version);
    writeStorageValue(
      keys.isOtel,
      typeof sdkVersion.isOtel === "boolean" ? String(sdkVersion.isOtel) : null,
    );
    writeStorageValue(keys.checkedAt, checkedAt);
  } catch {
    // Storage can be unavailable in hardened/private browser contexts.
  }
};

export const clearProjectSdkVersionInfo = (projectId: string) => {
  if (typeof window === "undefined") return;

  const keys = sdkVersionStorageKeys(projectId);
  try {
    writeStorageValue(keys.language, null);
    writeStorageValue(keys.version, null);
    writeStorageValue(keys.isOtel, null);
    writeStorageValue(keys.checkedAt, null);
  } catch {
    // Storage can be unavailable in hardened/private browser contexts.
  }
};
