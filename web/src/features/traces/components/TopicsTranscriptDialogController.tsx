import { type ComponentProps } from "react";

import { Banner } from "@/src/components/design-system/Banner/Banner";
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
      <Banner variant="error">
        <p className="break-words">{query.error.message}</p>
      </Banner>
    );
  }
  if (!query.data) return <p className="text-xs">Loading transcript…</p>;
  if (query.data.tooLarge) {
    return (
      <Banner variant="warning">
        Topics does not process this trace because it exceeds the Topics trace
        size limit.
      </Banner>
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
        <Banner variant="warning">
          Topics skips this trace as insufficient input because the transcript
          has no message content.
        </Banner>
      )}
      <Codeblock
        label="Topics transcript"
        language={{ value: "text", label: "Summarizer input" }}
        value={query.data.text}
      />
    </>
  );
}
