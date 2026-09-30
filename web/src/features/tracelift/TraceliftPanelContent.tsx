import { CircleCheck, X } from "lucide-react";

import { Accordion } from "@/src/components/design-system/Accordion/Accordion";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Button } from "@/src/components/design-system/Button/Button";
import { Spinner } from "@/src/components/design-system/Spinner/Spinner";
import { TraceliftFindingSection } from "./TraceliftFindingSection";
import { type TraceliftFinding, type TraceliftSummary } from "./types";
import { TRACELIFT_TITLE } from "./constants";
import { usdFormatter } from "@/src/utils/numbers";

type TraceliftPanelContentProps = {
  onClose: () => void;
  onOpenAssistant: (finding: TraceliftFinding) => void;
  onViewObservations: (finding: TraceliftFinding) => void;
  onViewExample: () => void;
} & (
  | {
      status: "success";
      findings: TraceliftFinding[];
      summary: TraceliftSummary;
    }
  | { status: "loading" }
  | { status: "error"; onRetry: () => void }
);

export function TraceliftPanelContent(props: TraceliftPanelContentProps) {
  const { onClose, onOpenAssistant, onViewObservations, onViewExample } = props;
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
            Improve your traces with focused instrumentation fixes.
          </p>
        </div>
        <IconButton
          icon={X}
          label={`Close ${TRACELIFT_TITLE}`}
          onClick={onClose}
        />
      </div>

      {props.status === "success" && (
        <div className="px-4 pb-4">
          <section
            aria-label="Summary"
            className="bg-muted/50 flex flex-col gap-3 rounded-md p-3"
          >
            <p className="text-muted-foreground text-xs">Last 30 days</p>
            <dl className="grid grid-cols-2 gap-4">
              <div className="flex flex-col justify-between gap-1">
                <dt className="text-muted-foreground text-xs">
                  Recorded issues
                </dt>
                <dd className="text-xl font-bold tabular-nums">
                  {props.summary.issueCount.toLocaleString("en-US")}
                </dd>
              </div>
              <div className="flex flex-col justify-between gap-1">
                <dt className="text-muted-foreground text-xs">
                  Issue categories
                </dt>
                <dd className="text-xl font-bold tabular-nums">
                  {props.findings.length.toLocaleString("en-US")}
                </dd>
              </div>
              {props.summary.langfuseIngestionCostUsd !== null && (
                <div className="flex flex-col justify-between gap-1">
                  <dt className="text-muted-foreground text-xs">
                    Langfuse ingestion cost (USD)
                  </dt>
                  <dd className="text-xl font-bold tabular-nums">
                    {usdFormatter(props.summary.langfuseIngestionCostUsd)}
                  </dd>
                </div>
              )}
            </dl>
          </section>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto border-t px-4 pb-4">
        {props.status === "loading" && (
          <div
            role="status"
            className="text-muted-foreground flex items-center gap-2 py-6 text-sm"
          >
            <Spinner size="sm" /> Loading issues…
          </div>
        )}
        {props.status === "error" && (
          <div
            role="alert"
            className="flex flex-col items-start gap-3 py-6 text-sm"
          >
            <p>Could not load issues.</p>
            <Button
              text="Retry"
              variant="secondary"
              size="sm"
              onClick={props.onRetry}
            />
          </div>
        )}
        {props.status === "success" && props.findings.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
            <CircleCheck className="text-muted-foreground size-6" aria-hidden />
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-bold">No issues found</h3>
              <p className="text-muted-foreground text-sm">
                No issues have been recorded in the last 30 days.
              </p>
            </div>
          </div>
        )}
        {props.status === "success" && props.findings.length > 0 && (
          <div className="flex flex-col gap-1 pt-4">
            <h3 className="text-sm font-bold">Suggested improvements</h3>
            <Accordion type="multiple" defaultValue={[props.findings[0]!.id]}>
              {props.findings.map((finding) => (
                <TraceliftFindingSection
                  key={finding.id}
                  finding={finding}
                  onOpenAssistant={onOpenAssistant}
                  onViewObservations={onViewObservations}
                  onViewExample={onViewExample}
                />
              ))}
            </Accordion>
          </div>
        )}
      </div>
    </section>
  );
}
