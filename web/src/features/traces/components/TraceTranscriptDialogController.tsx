import { type ComponentProps } from "react";

import { Alert } from "@/src/components/design-system/Alert/Alert";
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
      <Alert variant="destructive" size="sm">
        <Alert.Description>
          <p className="break-words">{query.error.message}</p>
        </Alert.Description>
      </Alert>
    );
  }
  if (!query.data) return <p className="text-xs">Loading transcript…</p>;

  return (
    <>
      {query.data.cutoff && (
        <Alert variant="warning" size="sm">
          <Alert.Description>
            This transcript is incomplete because the trace exceeds the
            observation limit.
          </Alert.Description>
        </Alert>
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
