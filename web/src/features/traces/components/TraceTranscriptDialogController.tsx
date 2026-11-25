import { type ComponentProps } from "react";

import { Banner } from "@/src/components/design-system/Banner/Banner";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import {
  InternalTranscriptDialogController,
  type TranscriptSource,
} from "@/src/features/traces/components/InternalTranscriptDialogController";
import { api } from "@/src/utils/api";

export function TraceTranscriptDialogController(
  props: Omit<
    ComponentProps<typeof InternalTranscriptDialogController>,
    "title" | "renderInspector"
  >,
) {
  return (
    <InternalTranscriptDialogController
      {...props}
      title="Trace transcript"
      renderInspector={(source) => <TraceTranscriptInspector {...source} />}
    />
  );
}

function TraceTranscriptInspector(source: TranscriptSource) {
  const query = api.events.transcriptByTraceId.useQuery({
    ...source,
    context: "other",
  });

  if (query.error) {
    return (
      <Banner variant="error">
        <p className="break-words">{query.error.message}</p>
      </Banner>
    );
  }
  if (!query.data) return <p className="text-xs">Loading transcript…</p>;

  return (
    <>
      {query.data.cutoff && (
        <Banner variant="warning">
          This transcript is incomplete because the trace exceeds the
          observation limit.
        </Banner>
      )}
      {query.data.transcript ? (
        <JSONView
          title="Transcript"
          json={query.data.transcript}
          preserveStrings
        />
      ) : (
        <p className="text-muted-foreground text-xs">
          No transcript available for this trace.
        </p>
      )}
    </>
  );
}
