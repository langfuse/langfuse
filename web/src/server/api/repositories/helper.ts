import { env } from "@/src/env.mjs";

export const isClickhouseEligible = (admin: boolean) => {
  return admin === true && env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION !== undefined;
};
