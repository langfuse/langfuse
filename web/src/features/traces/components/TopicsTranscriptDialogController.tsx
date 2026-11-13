import { type ReactNode } from "react";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Codeblock } from "@/src/components/design-system/Codeblock/Codeblock";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { useInternalFeaturesEnabled } from "@/src/features/feature-flags/hooks/useInternalFeaturesEnabled";
import { api } from "@/src/utils/api";

type TopicsTranscriptSource = {
  projectId: string;
  traceId: string;
  timestamp: Date;
};

export function TopicsTranscriptDialogController({
  children,
  ...source
}: TopicsTranscriptSource & {
  children: (control: { openDialog: (() => void) | undefined }) => ReactNode;
}) {
  const internalFeaturesEnabled = useInternalFeaturesEnabled();
  if (!internalFeaturesEnabled) {
    return children({ openDialog: undefined });
  }

  return (
    <DialogController<TopicsTranscriptSource>
      renderDialog={({ state }) => (
        <Dialog title="Topics transcript" size="lg" closeOnInteractionOutside>
          <Dialog.Body>
            <div className="ph-no-capture flex flex-col gap-4">
              <TopicsTranscriptInspector {...state} />
            </div>
          </Dialog.Body>
        </Dialog>
      )}
    >
      {({ openDialog }) => children({ openDialog: () => openDialog(source) })}
    </DialogController>
  );
}

function TopicsTranscriptInspector(source: TopicsTranscriptSource) {
  const query = api.events.topicsTranscriptByTraceId.useQuery(source);

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
