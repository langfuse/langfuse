import React from "react";
import { Download, ExternalLinkIcon, Loader2 } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { IOPreview } from "@/src/components/trace/components/IOPreview/IOPreview";
import { api, type RouterOutputs } from "@/src/utils/api";
import { downloadJsonFile } from "@/src/components/session/actions/downloadSessionAsJson";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { compactNumberFormatter } from "@/src/utils/numbers";

export type SessionTraceObservation =
  RouterOutputs["sessions"]["observationsForTraceFromEvents"][number];

/** Display cap of a preview section — matches the server's preview head. */
const PREVIEW_DISPLAY_CHARS = 4_000;

/**
 * One field of an over-limit observation: a bounded, non-interactive preview
 * head. Never grows with payload size — the display is capped even when the
 * shipped value is larger (an under-cap sibling field, or capped metadata);
 * the trace view and the download are the full-reading surfaces (LFE-10958).
 */
const TruncatedIOSection = ({
  label,
  value,
  fullLength,
  truncated,
}: {
  label: string;
  value: unknown;
  fullLength: number;
  truncated: boolean;
}) => {
  if (value === null || value === undefined || value === "") return null;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const shown =
    text.length > PREVIEW_DISPLAY_CHARS
      ? text.slice(0, PREVIEW_DISPLAY_CHARS)
      : text;

  return (
    <div className="flex flex-col gap-1">
      <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
        <span className="font-bold">{label}</span>
        {(truncated || shown.length < text.length) && (
          <span>
            {compactNumberFormatter(Math.max(fullLength, text.length), 1)}{" "}
            characters — showing the first{" "}
            {compactNumberFormatter(shown.length, 1)}
          </span>
        )}
      </div>
      <pre className="bg-muted/50 max-h-40 overflow-hidden rounded-md border p-2 font-mono text-xs break-all whitespace-pre-wrap">
        {shown}
      </pre>
    </div>
  );
};

/**
 * Renders one observation's I/O inside a session-detail trace card.
 *
 * Observations whose I/O fits the server's inline limit render exactly as
 * before (IOPreview, pretty chat view included). Observations the server
 * truncated render as a bounded preview with the true size and two escape
 * hatches: the trace view (full machinery: worker parse, virtualized JSON
 * viewer) and a download that saves the raw payload without rendering it.
 */
export const SessionObservationIO = ({
  observation,
  projectId,
  sessionId,
  traceId,
  environment,
  showCorrections,
  onOpenInTraceView,
}: {
  observation: SessionTraceObservation;
  projectId: string;
  sessionId: string;
  traceId: string;
  environment?: string;
  showCorrections: boolean;
  onOpenInTraceView: (observationId: string) => void;
}) => {
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();
  const [isDownloading, setIsDownloading] = React.useState(false);

  const isIOTruncated = Boolean(
    observation.inputTruncated || observation.outputTruncated,
  );

  const onDownload = async () => {
    capture("session_detail:truncated_observation_download_click");
    setIsDownloading(true);
    try {
      // Plain client call (no React Query cache): the full payload is saved
      // to a file and must not be retained in memory afterwards.
      const full =
        await utils.client.sessions.observationFullIOFromEvents.query({
          projectId,
          sessionId,
          traceId,
          observationId: observation.id,
          startTime: observation.startTime,
        });
      // I/O stays embedded as raw strings: parsing multi-megabyte JSON just
      // to pretty-print it risks the same freeze this card exists to avoid.
      downloadJsonFile({
        data: {
          observationId: observation.id,
          traceId,
          input: full.input,
          output: full.output,
          metadata: full.metadata,
        },
        fileName: `observation-${observation.id}.json`,
      });
    } catch {
      showErrorToast(
        "Download failed",
        "Could not fetch the observation's full I/O. Please try again.",
      );
    } finally {
      setIsDownloading(false);
    }
  };

  const openInTraceView = () => {
    capture("session_detail:truncated_observation_open_trace_click");
    onOpenInTraceView(observation.id);
  };

  if (!isIOTruncated) {
    return (
      <>
        <IOPreview
          input={observation.input ?? undefined}
          output={observation.output ?? undefined}
          metadata={observation.metadata ?? undefined}
          observationName={observation.name ?? undefined}
          hideIfNull
          projectId={projectId}
          traceId={traceId}
          observationId={observation.id}
          environment={environment}
          showCorrections={showCorrections}
        />
        {observation.metadataTruncated && (
          <p className="text-muted-foreground text-xs">
            Some metadata values are too large to show here.{" "}
            <button
              type="button"
              onClick={openInTraceView}
              className="text-primary underline underline-offset-2 hover:no-underline"
            >
              Open in trace view
            </button>{" "}
            for full metadata.
          </p>
        )}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed p-3">
      <p className="text-muted-foreground text-xs">
        This observation&apos;s input/output is too large to display in the
        session view.
      </p>
      <TruncatedIOSection
        label="Input"
        value={observation.input}
        fullLength={observation.inputLength}
        truncated={observation.inputTruncated}
      />
      <TruncatedIOSection
        label="Output"
        value={observation.output}
        fullLength={observation.outputLength}
        truncated={observation.outputTruncated}
      />
      {/* Metadata stays visible when I/O is truncated — it shipped with the
          observation and was always shown alongside I/O before the cap. */}
      {observation.metadata !== null &&
        typeof observation.metadata === "object" &&
        Object.keys(observation.metadata).length > 0 && (
          <TruncatedIOSection
            label="Metadata"
            value={observation.metadata}
            fullLength={observation.metadataLength}
            truncated={observation.metadataTruncated}
          />
        )}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={openInTraceView}>
          <ExternalLinkIcon className="mr-1 h-3.5 w-3.5" />
          Open in trace view
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onDownload}
          disabled={isDownloading}
        >
          {isDownloading ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="mr-1 h-3.5 w-3.5" />
          )}
          Download I/O
        </Button>
      </div>
    </div>
  );
};
