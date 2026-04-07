import { env } from "@/src/env.mjs";

/**
 * DEV ONLY: enables a repo-local auth bypass for design and prototyping work.
 * Never turn this on in production or ship it as product behavior.
 */
export const isDevAuthBypassEnabled =
  process.env.NODE_ENV === "development" &&
  env.NEXT_PUBLIC_DEV_SKIP_AUTH === "true";

export const devAuthBasePath = `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/dev-auth`;
