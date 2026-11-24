import { isTopicsEnabled } from "@langfuse/shared/topics/server";
import type { Flags } from "../types";
import {
  parseFlags as parseStoredFlags,
  parseFlagsWithOrganizationDefaults as parseStoredFlagsWithOrganizationDefaults,
} from "../utils";

const applyDeploymentAvailability = (flags: Flags): Flags => ({
  ...flags,
  langfuseTopics: isTopicsEnabled() && flags.langfuseTopics,
});

export const parseFlags: typeof parseStoredFlags = (...args) =>
  applyDeploymentAvailability(parseStoredFlags(...args));

export const parseFlagsWithOrganizationDefaults: typeof parseStoredFlagsWithOrganizationDefaults =
  (...args) =>
    applyDeploymentAvailability(
      parseStoredFlagsWithOrganizationDefaults(...args),
    );
