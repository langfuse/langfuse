import { useState } from "react";
import { subDays } from "date-fns";
import { api } from "@/src/utils/api";
import { useRouter } from "next/router";
import { toast } from "sonner";
import { rangeToString } from "@langfuse/shared";
import { useInAppAiAgent } from "@/src/features/in-app-agent";
import { buildEventsTablePathForObservationIds } from "@/src/features/events/lib/eventsTablePaths";
import { TraceliftPanelContent } from "./TraceliftPanelContent";
import { useTracelift } from "./TraceliftContext";
import type { TraceliftFinding } from "./types";
import { createTraceliftFinding, isTraceliftIssue } from "./issuePresentation";

export function TraceliftDrawerContent() {
  const router = useRouter();
  const { setOpen } = useTracelift();
  const { isAvailable, openAssistantWithPrompt } = useInAppAiAgent();
  const projectId =
    typeof router.query.projectId === "string" ? router.query.projectId : "";
  const [timeRange] = useState(() => {
    const toTimestamp = new Date();
    return { fromTimestamp: subDays(toTimestamp, 30), toTimestamp };
  });
  const issues = api.tracelift.issueCounts.useQuery(
    { projectId, ...timeRange },
    { enabled: !!projectId },
  );

  const openAssistant = (prompt: string) => {
    if (!isAvailable) {
      toast.info("The assistant is unavailable in this environment.", {
        description: "Copy the prompt to use it with your coding agent.",
      });
      return;
    }

    if (openAssistantWithPrompt(prompt)) {
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

  const contentProps = (() => {
    if (issues.isError) {
      return {
        status: "error" as const,
        onRetry: () => {
          issues.refetch();
        },
      };
    }
    if (!issues.data) return { status: "loading" as const };
    return {
      status: "success" as const,
      findings: issues.data.counts.flatMap((finding) =>
        isTraceliftIssue(finding.issue)
          ? [
              createTraceliftFinding(
                { ...finding, issue: finding.issue },
                { projectId, ...timeRange },
              ),
            ]
          : [],
      ),
    };
  })();

  return (
    <TraceliftPanelContent
      key={projectId}
      {...contentProps}
      onClose={() => setOpen(false)}
      onOpenAssistant={isAvailable ? openAssistant : undefined}
      onViewObservations={viewObservations}
      onViewExample={() => setOpen(false)}
    />
  );
}
