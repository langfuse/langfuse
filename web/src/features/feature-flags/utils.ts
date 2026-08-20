import {
  availableFlags,
  featurePreviewFlags,
  isFeaturePreviewAvailable,
} from "./available-flags";
import type {
  FeaturePreviewAvailabilityContext,
  FeaturePreviewFlag,
} from "./available-flags";
import { type Flags } from "./types";

const isFeaturePreviewFlag = (
  flag: (typeof availableFlags)[number],
): flag is FeaturePreviewFlag =>
  featurePreviewFlags.some((previewFlag) => previewFlag === flag);

export const getFeaturePreviewOptOutFlag = (flag: FeaturePreviewFlag) =>
  `feature-preview:${flag}:disabled`;

export const receivesFeaturePreviewsByDefault = (
  email: string | null | undefined,
) => {
  const normalizedEmail = email?.toLowerCase();
  return (
    normalizedEmail?.endsWith("@langfuse.com") === true ||
    normalizedEmail?.endsWith("@clickhouse.com") === true
  );
};

export const parseFlags = (
  dbFlags: string[],
  context: FeaturePreviewAvailabilityContext & {
    email: string | null | undefined;
  },
): Flags => {
  const parsedFlags = {} as Flags;
  const enableFeaturePreviewsByDefault = receivesFeaturePreviewsByDefault(
    context.email,
  );

  availableFlags.forEach((flag) => {
    if (
      enableFeaturePreviewsByDefault &&
      isFeaturePreviewFlag(flag) &&
      isFeaturePreviewAvailable(flag, context)
    ) {
      parsedFlags[flag] = !dbFlags.includes(getFeaturePreviewOptOutFlag(flag));
      return;
    }

    parsedFlags[flag] = dbFlags.includes(flag);
  });

  return parsedFlags;
};
