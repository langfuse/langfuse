import { useSession } from "next-auth/react";
import { type ReactNode } from "react";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { api } from "@/src/utils/api";

type TraceTranscriptSource = {
  projectId: string;
  traceId: string;
  timestamp: Date;
};

export function TraceTranscriptDialogController({
  children,
  ...source
}: TraceTranscriptSource & {
  children: (control: { openDialog: (() => void) | undefined }) => ReactNode;
}) {
  const { data: session } = useSession();
  if (session?.user?.admin !== true) {
    return children({ openDialog: undefined });
  }

  return (
    <DialogController<TraceTranscriptSource>
      renderDialog={({ state }) => (
        <Dialog title="Trace transcript" size="lg" closeOnInteractionOutside>
          <Dialog.Body>
            <div className="ph-no-capture flex flex-col gap-4">
              <TraceTranscriptInspector {...state} />
            </div>
          </Dialog.Body>
        </Dialog>
      )}
    >
      {({ openDialog }) => children({ openDialog: () => openDialog(source) })}
    </DialogController>
  );
}

function TraceTranscriptInspector(source: TraceTranscriptSource) {
  const query = api.events.transcriptByTraceId.useQuery(source);

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
