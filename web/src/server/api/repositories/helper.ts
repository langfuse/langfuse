import { env } from "@/src/env.mjs";
import { type Session } from "next-auth";

export const isClickhouseEligible = (session: Session | null) => {
  return (
    session?.user?.admin === true &&
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION !== undefined
  );
};
