import { useSession } from "next-auth/react";

import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";

import { isMonitorsAvailable } from "./monitorsAvailability";

/** useMonitorsAvailable reports whether this deployment can use monitors.
 * `isPending` is true while availability is still unknown: on self-hosted
 * deployments the write mode arrives with the session, so callers should
 * render nothing instead of flashing an unavailable state. */
export function useMonitorsAvailable(): {
  available: boolean;
  isPending: boolean;
} {
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  const { data: session, status } = useSession();

  const available = isMonitorsAvailable({
    isLangfuseCloud,
    v4WriteMode: session?.environment?.v4WriteMode,
  });

  return { available, isPending: !available && status === "loading" };
}
