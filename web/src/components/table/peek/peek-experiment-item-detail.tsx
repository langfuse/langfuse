import { useRouter } from "next/router";
import { usePeekData } from "@/src/components/table/peek/hooks/usePeekData";
import { Trace } from "@/src/components/trace/Trace";
import { Skeleton } from "@/src/components/ui/skeleton";
import { TablePeekView } from "@/src/components/table/peek";
import { ExperimentPeekFooter } from "@/src/features/experiments/components/ExperimentPeekFooter";

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

  if (!peekId || !trace.data) {
    return <Skeleton className="h-full w-full rounded-none" />;
  }

  return (
    <Trace
      key={`${trace.data.id}-${peekId}`}
      trace={trace.data}
      scores={trace.data.scores}
      corrections={trace.data.corrections}
      projectId={trace.data.projectId}
      observations={trace.data.observations}
      context="peek"
    />
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

  return (
    <TablePeekView
      {...props}
      title={peekId ? `Experiment Item: ${peekId}` : undefined}
      footer={<ExperimentPeekFooter projectId={projectId} />}
    >
      <PeekViewExperimentItemDetail projectId={projectId} />
    </TablePeekView>
  );
};
