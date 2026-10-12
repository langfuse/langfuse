import { useCallback, useSyncExternalStore } from "react";

import {
  getInAppAgentContextualLanding,
  subscribeToInAppAgentContextualLanding,
} from "@/src/features/in-app-agent/stores/inAppAgentContextualLandingStore";

export function useInAppAgentContextualLanding(projectId: string | undefined) {
  const subscribe = useCallback(
    (listener: () => void) =>
      projectId
        ? subscribeToInAppAgentContextualLanding(projectId, listener)
        : () => undefined,
    [projectId],
  );
  const getSnapshot = useCallback(
    () => (projectId ? getInAppAgentContextualLanding(projectId) : undefined),
    [projectId],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
