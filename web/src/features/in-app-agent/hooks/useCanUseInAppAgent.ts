import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { useInAppAiAgent } from "@/src/features/in-app-agent/hooks/useInAppAiAgent";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";

/** Whether the current user/context may use the in-app assistant at all.
 * Shared gate for the launcher button and the window host. */
export function useCanUseInAppAgent() {
  const { isAvailable } = useInAppAiAgent();
  const hasInAppAgentEntitlement = useHasEntitlement("in-app-agent");
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  const { organization } = useQueryProjectOrOrganization();

  return (
    isAvailable &&
    hasInAppAgentEntitlement &&
    isLangfuseCloud &&
    Boolean(organization)
  );
}
