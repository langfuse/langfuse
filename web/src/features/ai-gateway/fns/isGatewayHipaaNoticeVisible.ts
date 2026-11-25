import type { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";

/** Only HIPAA-region customers need a BAA with the provider they forward requests to. */
export const isGatewayHipaaNoticeVisible = (
  region: ReturnType<typeof useLangfuseCloudRegion>["region"],
) => region === "HIPAA";
