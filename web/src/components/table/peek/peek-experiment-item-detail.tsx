import { useRouter } from "next/router";
import { usePeekData } from "@/src/components/table/peek/hooks/usePeekData";
import { TraceDetailBody } from "@/src/components/trace/TraceDetailBody";
import { TablePeekView } from "@/src/components/table/peek";

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

  return (
    <TraceDetailBody trace={trace.data} context="peek" keySuffix={peekId} />
  );
};

export const TablePeekViewExperimentItemDetail = (
  props: Omit<
    React.ComponentProps<typeof TablePeekView>,
    "children" | "title"
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
    >
      <PeekViewExperimentItemDetail projectId={projectId} />
    </TablePeekView>
  );
};
