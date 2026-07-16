import { useRouter } from "next/router";
import { usePeekData } from "@/src/components/table/peek/hooks/usePeekData";
import { TraceDetailBody } from "@/src/components/trace/TraceDetailBody";
import { TablePeekView } from "@/src/components/table/peek";
import { ExperimentPeekFooter } from "@/src/features/experiments/components/ExperimentPeekFooter";
import { useExperimentPeekNavigation } from "@/src/features/experiments/hooks/useExperimentPeekNavigation";

const PeekViewExperimentItemDetail = ({ projectId }: { projectId: string }) => {
  const router = useRouter();
  const peekId = router.query.peek as string | undefined;
  const timestampParam = router.query.timestamp as string | undefined;

  // Decode the timestamp parameter before parsing as Date
  // This handles cases where the timestamp might be URL-encoded
  const timestamp = timestampParam
    ? new Date(decodeURIComponent(timestampParam))
    : undefined;

  const traceId = router.query.traceId as string | undefined;

  const trace = usePeekData({
    projectId,
    traceId,
    timestamp,
  });

  // No trace target means the current experiment has no run for this item;
  // without this guard the disabled trace query would show a skeleton forever.
  if (!traceId) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <span className="text-muted-foreground text-sm">
          No run for this item in the selected experiment
        </span>
      </div>
    );
  }

  return (
    <TraceDetailBody trace={trace.data} context="peek" keySuffix={peekId} />
  );
};

export const TablePeekViewExperimentItemDetail = (
  props: Omit<
    React.ComponentProps<typeof TablePeekView>,
    "children" | "title" | "footer"
  > & {
    projectId: string;
  },
) => {
  const { projectId } = props;
  const router = useRouter();
  const peekId = router.query.peek as string | undefined;
  const { canSwitch } = useExperimentPeekNavigation();

  return (
    <TablePeekView
      {...props}
      title={peekId ? `Experiment Item: ${peekId}` : undefined}
      footer={
        canSwitch ? <ExperimentPeekFooter projectId={projectId} /> : undefined
      }
    >
      <PeekViewExperimentItemDetail projectId={projectId} />
    </TablePeekView>
  );
};
