import { CircleCheck, X } from "lucide-react";

import { Accordion } from "@/src/components/design-system/Accordion/Accordion";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { TraceliftFindingSection } from "./TraceliftFindingSection";
import { type TraceliftFinding, type TraceliftSummary } from "./types";
import { TRACELIFT_TITLE } from "./constants";
import { usdFormatter } from "@/src/utils/numbers";

type TraceliftPanelContentProps = {
  findings: TraceliftFinding[];
  summary: TraceliftSummary;
  onClose: () => void;
  onOpenAssistant: (finding: TraceliftFinding) => void;
  onViewObservations: (finding: TraceliftFinding) => void;
};

export function TraceliftPanelContent({
  findings,
  summary,
  onClose,
  onOpenAssistant,
  onViewObservations,
}: TraceliftPanelContentProps) {
  return (
    <section
      aria-label={TRACELIFT_TITLE}
      className="bg-background flex h-full min-h-0 w-full min-w-0 flex-col"
    >
      <div className="flex items-start justify-between gap-4 px-4 pt-4 pb-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold">{TRACELIFT_TITLE}</h2>
            <Badge text="Preview" size="sm" color="yellow" />
          </div>
          <p className="text-muted-foreground text-sm">
            Fix erroneous traces in a few easy steps.
          </p>
        </div>
        <IconButton
          icon={X}
          label={`Close ${TRACELIFT_TITLE}`}
          onClick={onClose}
        />
      </div>

      <div className="px-4 pb-4">
        <section
          aria-label="Summary"
          className="bg-muted/50 flex flex-col gap-3 rounded-md p-3"
        >
          <p className="text-muted-foreground text-xs">Last 30 days</p>
          <dl className="grid grid-cols-2 gap-4">
            <div className="flex flex-col justify-between gap-1">
              <dt className="text-muted-foreground text-xs">
                Erroneous observations
              </dt>
              <dd className="text-xl font-bold tabular-nums">
                {summary.observationCount.toLocaleString("en-US")}
              </dd>
            </div>
            <div className="flex flex-col justify-between gap-1">
              <dt className="text-muted-foreground text-xs">
                Langfuse ingestion cost (USD)
              </dt>
              <dd className="text-xl font-bold tabular-nums">
                {usdFormatter(summary.langfuseIngestionCostUsd)}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto border-t px-4 pb-4">
        {findings.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
            <CircleCheck className="text-muted-foreground size-6" aria-hidden />
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-bold">No improvements to review</h3>
              <p className="text-muted-foreground text-sm">
                Findings and next steps will appear here when they are
                available.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1 pt-4">
            <h3 className="text-sm font-bold">Improvements</h3>
            <Accordion type="multiple" defaultValue={[findings[0]!.id]}>
              {findings.map((finding) => (
                <TraceliftFindingSection
                  key={finding.id}
                  finding={finding}
                  onOpenAssistant={onOpenAssistant}
                  onViewObservations={onViewObservations}
                />
              ))}
            </Accordion>
          </div>
        )}
      </div>
    </section>
  );
}
