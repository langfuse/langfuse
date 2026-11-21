import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { useSession } from "next-auth/react";

/** Whether the org can set access logging: only in "org" mode, since "enforced" and "disabled" leave nothing to choose. */
export function useShowAccessLoggingSetting(): boolean {
  const { data: session } = useSession();
  const hasEntitlement = useHasEntitlement("audit-logs");
  return hasEntitlement && session?.environment.accessAuditLogMode === "org";
}
