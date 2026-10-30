import { useState } from "react";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { api } from "@/src/utils/api";
import {
  dayWindow,
  topicWindowLabel,
  type TopicAnalysisMap,
} from "./topic-maps";
import { TopicSliceFields } from "./TopicSliceFields";
import { TopicsErrorMessage } from "./TopicsErrorMessage";

/** Reruns an analysis with the same slice and facets on a new window. */
export function RerunAnalysisDialog({
  projectId,
  analysis,
  onStarted,
  closeDialog,
}: {
  projectId: string;
  analysis: TopicAnalysisMap;
  onStarted: (executionId: string) => void;
  closeDialog: () => void;
}) {
  const [now] = useState(Date.now);
  const [days, setDays] = useState<number>(7);
  const utils = api.useUtils();
  const rerun = api.topics.rerunAnalysis.useMutation({
    onSuccess: () => utils.topics.maps.invalidate({ projectId }),
  });
  const range = dayWindow(days, now);
  async function submit() {
    const result = await rerun.mutateAsync({
      projectId,
      executionId: analysis.latestExecutionId,
      timeRange: range,
    });
    closeDialog();
    onStarted(result.id);
  }
  return (
    <Dialog
      title={`Rerun ${analysis.label}`}
      actions={[
        {
          label: "Rerun analysis",
          loading: rerun.isPending,
          onClick: () => {
            submit().catch(() => undefined);
          },
        },
      ]}
    >
      <Dialog.Body>
        <p className="text-muted-foreground">
          Clusters the same slice and facets again over a new window, then
          compares the new run with the latest one.
        </p>
        <TopicSliceFields.Section
          label="Window"
          description={topicWindowLabel(range)}
        >
          <TopicSliceFields.Window
            days={[7, 30]}
            value={days}
            onChange={setDays}
          />
        </TopicSliceFields.Section>
        {rerun.error ? (
          <TopicsErrorMessage message={rerun.error.message} />
        ) : null}
      </Dialog.Body>
    </Dialog>
  );
}
