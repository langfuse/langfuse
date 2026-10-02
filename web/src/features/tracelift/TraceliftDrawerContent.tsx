import { useRouter } from "next/router";
import { toast } from "sonner";
import { rangeToString } from "@langfuse/shared";
import { useInAppAiAgent } from "@/src/features/in-app-agent";
import { buildEventsTablePathForObservationIds } from "@/src/features/events/lib/eventsTablePaths";
import { TraceliftPanelContent } from "./TraceliftPanelContent";
import { useTracelift } from "./TraceliftContext";
import {
  createTraceliftPreviewFindings,
  traceliftPreviewSummary,
} from "./fixtures/previewFindings";
import type { TraceliftFinding } from "./types";

export function TraceliftDrawerContent() {
  const router = useRouter();
  const { setOpen } = useTracelift();
  const { isAvailable, openAssistantWithPrompt } = useInAppAiAgent();
  const projectId = router.query.projectId as string;

  const openAssistant = (finding: TraceliftFinding) => {
    if (!isAvailable) {
      toast.info("The assistant is unavailable in this environment.", {
        description: "Copy the prompt to use it with your coding agent.",
      });
      return;
    }

    if (openAssistantWithPrompt(finding.prompt)) {
      setOpen(false);
    }
  };

  const viewObservations = (finding: TraceliftFinding) => {
    setOpen(false);
    router.push(
      buildEventsTablePathForObservationIds({
        currentPath: router.asPath,
        projectId,
        observationIds: finding.observationIds,
        dateRange: rangeToString({ range: "last30Days" }),
      }),
    );
  };

  return (
    <TraceliftPanelContent
      key={projectId}
      findings={createTraceliftPreviewFindings()}
      summary={traceliftPreviewSummary}
      onClose={() => setOpen(false)}
      onOpenAssistant={openAssistant}
      onViewObservations={viewObservations}
    />
  );
}
