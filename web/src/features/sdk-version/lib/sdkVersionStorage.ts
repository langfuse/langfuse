import { writeStorageValues } from "@/src/utils/browserStorage";
import {
  sdkVersionStorageKeys,
  type SdkVersionInfo,
} from "@/src/features/sdk-version/lib/sdkVersionCapabilities";

export const persistProjectSdkVersionInfo = (
  projectId: string,
  sdkVersion: SdkVersionInfo,
  checkedAt: string,
) => {
  const keys = sdkVersionStorageKeys(projectId);
  writeStorageValues("localStorage", [
    [keys.language, sdkVersion.language],
    [keys.version, sdkVersion.version],
    [keys.checkedAt, checkedAt],
  ]);
};

export const clearProjectSdkVersionInfo = (projectId: string) => {
  const keys = sdkVersionStorageKeys(projectId);
  writeStorageValues("localStorage", [
    [keys.language, null],
    [keys.version, null],
    [keys.checkedAt, null],
  ]);
};
