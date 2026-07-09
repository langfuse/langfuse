import { TRPCError } from "@trpc/server";

import { env } from "@/src/env.mjs";
import {
  type RedirectUrlValidator,
  type WebhookValidationWhitelist,
  validateWebhookURL,
  whitelistFromEnv,
} from "@langfuse/shared/src/server";

const LOCAL_DEVELOPMENT_CALLOUT_WHITELIST: WebhookValidationWhitelist = {
  hosts: ["localhost", "127.0.0.1", "[::1]"],
  ips: ["127.0.0.1", "::1"],
  ip_ranges: ["127.0.0.0/8", "::1/128"],
};

export const webCalloutWhitelist = (): WebhookValidationWhitelist => {
  const whitelist = whitelistFromEnv();

  if (env.NODE_ENV !== "development") {
    return whitelist;
  }

  return {
    hosts: unique([
      ...whitelist.hosts,
      ...LOCAL_DEVELOPMENT_CALLOUT_WHITELIST.hosts,
    ]),
    ips: unique([...whitelist.ips, ...LOCAL_DEVELOPMENT_CALLOUT_WHITELIST.ips]),
    ip_ranges: unique([
      ...whitelist.ip_ranges,
      ...LOCAL_DEVELOPMENT_CALLOUT_WHITELIST.ip_ranges,
    ]),
  };
};

export const validateWebCalloutUrl: RedirectUrlValidator = (
  url,
  whitelist = webCalloutWhitelist(),
) => validateWebhookURL(url, whitelist, { allowedPorts: "any" });

export const assertValidCalloutUrl = async (url: string) => {
  try {
    await validateWebCalloutUrl(url);
  } catch (error) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        error instanceof Error
          ? `Invalid web callout URL: ${error.message}`
          : "Invalid web callout URL",
    });
  }
};

const unique = <T>(items: T[]): T[] => Array.from(new Set(items));
