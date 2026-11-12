import { useSession } from "next-auth/react";

import { canViewTraceTranscriptsEvals } from "@/src/features/evals/transcriptEvalsAccess";
import { useInternalFeaturesEnabled } from "@/src/features/feature-flags/hooks/useInternalFeaturesEnabled";
import { useProject } from "@/src/features/projects/hooks";

export function useCanViewTraceTranscriptsEvals(projectId: string) {
  const session = useSession();
  const { project } = useProject(projectId);
  const internalViewEnabled = useInternalFeaturesEnabled();
  return canViewTraceTranscriptsEvals(
    session.data,
    project,
    internalViewEnabled,
  );
}
