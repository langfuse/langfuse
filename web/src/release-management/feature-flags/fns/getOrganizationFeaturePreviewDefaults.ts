import {
  defaultOnFeaturePreviewFlags,
  featurePreviewFlags,
} from "../available-flags";
import { getFeaturePreviewOptOutFlag } from "../utils";

export const getOrganizationFeaturePreviewDefaults = (
  storedDefaults: string[],
) =>
  featurePreviewFlags.filter((flag) => {
    if (flag === "externalMediaStorage") return storedDefaults.includes(flag);
    if (storedDefaults.includes(getFeaturePreviewOptOutFlag(flag)))
      return false;
    if (
      defaultOnFeaturePreviewFlags.some((defaultFlag) => defaultFlag === flag)
    ) {
      if (
        flag === "sessionViewV2Timeline" &&
        storedDefaults.includes(getFeaturePreviewOptOutFlag("sessionViewV2"))
      ) {
        return false;
      }
      return true;
    }
    return storedDefaults.includes(flag);
  });
