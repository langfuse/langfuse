import { usePeekData } from "@/src/components/table/peek/hooks/usePeekData";
import { useRouter } from "next/router";
import {
  TraceDetailBody,
  traceDetailTitle,
} from "@/src/components/trace/TraceDetailBody";
import { TablePeekView } from "@/src/components/table/peek";
import { TraceDetailActions } from "@/src/components/trace/TraceDetailActions";

export const TablePeekViewTraceDetail = (
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
  const timestampParam = router.query.timestamp as string | undefined;

  // Decode the timestamp parameter before parsing as Date
  // This handles cases where the timestamp might be URL-encoded
  const timestamp = timestampParam
    ? new Date(decodeURIComponent(timestampParam))
    : undefined;

  const trace = usePeekData({
    projectId,
    traceId: peekId,
    timestamp,
  });

  return (
    <TablePeekView
      {...props}
      title={traceDetailTitle(trace.data, peekId)}
      actions={
        trace.data ? (
          <TraceDetailActions
            traceId={trace.data.id}
            projectId={trace.data.projectId}
            bookmarked={trace.data.bookmarked}
            isPublic={trace.data.public}
            name={trace.data.name}
            timestamp={timestamp}
            onAfterDelete={props.closePeek}
          />
        ) : undefined
      }
    >
      <TraceDetailBody trace={trace.data} context="peek" />
    </TablePeekView>
  );
};
