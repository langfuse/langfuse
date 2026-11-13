import { type ComponentProps } from "react";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Codeblock } from "@/src/components/design-system/Codeblock/Codeblock";
import {
  InternalTranscriptDialogController,
  type TranscriptSource,
} from "@/src/features/traces/components/InternalTranscriptDialogController";
import { useTopicsTranscript } from "@/src/features/traces/hooks/useTopicsTranscript";

export function TopicsTranscriptDialogController(
  props: Omit<
    ComponentProps<typeof InternalTranscriptDialogController>,
    "title" | "renderInspector"
  >,
) {
  return (
    <InternalTranscriptDialogController
      {...props}
      title="Topics transcript"
      renderInspector={(source) => <TopicsTranscriptInspector {...source} />}
    />
  );
}

function TopicsTranscriptInspector(source: TranscriptSource) {
  const query = useTopicsTranscript(source);

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
  if (query.data.tooLarge) {
    return (
      <Alert variant="warning" size="sm">
        <Alert.Description>
          Topics does not process this trace because it exceeds the Topics trace
          size limit.
        </Alert.Description>
      </Alert>
    );
  }
  if (query.data.text === null) {
    return (
      <p className="text-muted-foreground text-xs">
        No Topics transcript available for this trace.
      </p>
    );
  }

  return (
    <>
      {!query.data.hasContent && (
        <Alert variant="warning" size="sm">
          <Alert.Description>
            Topics skips this trace as insufficient input because the transcript
            has no message content.
          </Alert.Description>
        </Alert>
      )}
      <Codeblock
        label="Topics transcript"
        language={{ value: "text", label: "Summarizer input" }}
        value={query.data.text}
      />
    </>
  );
}
