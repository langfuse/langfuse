import { useSession } from "next-auth/react";

/**
 * Custom React frontend hook to determine if the enterprise edition (EE) features are enabled.
 */

export const useIsEeEnabled: () => boolean = () => {
  const session = useSession();
  return Boolean(session.data?.environment.eeEnabled);
};
