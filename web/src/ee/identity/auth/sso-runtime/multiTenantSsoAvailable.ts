import { env } from "@/src/env.mjs";

export const multiTenantSsoAvailable = Boolean(
  env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
);
