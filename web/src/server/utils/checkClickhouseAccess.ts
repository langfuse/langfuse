import { env } from "@/src/env.mjs";
import { type User } from "next-auth";

export const isClickhouseEligible = (user?: User | null) => {
  return (
    user &&
    user.admin &&
    user.admin === true &&
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION &&
    ["US", "EU", "STAGING", "DEV"].includes(
      env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
    )
  );
};
