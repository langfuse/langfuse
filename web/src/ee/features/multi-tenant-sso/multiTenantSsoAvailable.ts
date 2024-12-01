import { env } from "@/src/env.mjs";

export const multiTenantSsoAvailable =
  Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) ||
  Boolean(env.LANGFUSE_EE_LICENSE_KEY);
