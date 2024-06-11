import { env } from "@/src/env.mjs";
import { useSession } from "next-auth/react";

/**
 * Custom React frontend hook to determine if the enterprise edition (EE) features are enabled.
 *
 * This hook checks two conditions:
 * 1. If Langfuse is running on Langfuse Cloud
 * 2. If EE license is provided based on the user's session
 *
 * @returns {boolean}
 */

export const useIsEeEnabled: () => boolean = () => {
  const session = useSession();
  return (
    Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) ||
    Boolean(session.data?.environment.eeEnabled)
  );
};
