import { env } from "@/src/env.mjs";

export const getIsCloudEnvironment = () => 
 Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION)
