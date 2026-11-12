import { useRouter } from "next/router";
import { usePeekData } from "@/src/components/table/peek/hooks/usePeekData";
import { TraceDetailBody } from "@/src/features/traces/components/TraceDetailBody";
import { TablePeekView } from "@/src/components/table/peek";
import { ExperimentPeekFooter } from "@/src/features/experiments/components/ExperimentPeekFooter";
import { useExperimentPeekNavigation } from "@/src/features/experiments/hooks/useExperimentPeekNavigation";
import { parseTraceTimestampFromQuery } from "@/src/fns/parseTraceTimestampFromQuery/parseTraceTimestampFromQuery";
import {
  ObservabilityEntityDetailHeader,
  type EntityDetailHeaderConfiguration,
} from "@/src/components/ObservabilityEntityDetailHeader/ObservabilityEntityDetailHeader";
import { createPeekHeaderActions } from "@/src/components/ObservabilityEntityDetailHeader/fns/createPeekHeaderActions";

const PeekViewExperimentItemDetail = ({
  projectId,
  header,
}: {
  projectId: string;
  header: EntityDetailHeaderConfiguration;
}) => {
  const router = useRouter();
  const peekId = router.query.peek as string | undefined;
  const timestamp = parseTraceTimestampFromQuery(router.query.timestamp);
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
      <div className="flex h-full flex-col">
        <ObservabilityEntityDetailHeader {...header} metrics={[]} />
        <div className="flex flex-1 items-center justify-center p-4">
          <span className="text-muted-foreground text-sm">
            No run for this item in the selected experiment
          </span>
        </div>
      </div>
    );
  }

  return (
    <TraceDetailBody
      header={header}
      trace={trace.data}
      isPlaceholderData={trace.isPlaceholderData}
      context="peek"
      keySuffix={peekId}
      truncatedAtObservations={trace.truncatedAtObservations}
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
  const { canSwitch } = useExperimentPeekNavigation();

  return (
    <TablePeekView
      {...props}
      title={peekId ? `Experiment Item: ${peekId}` : undefined}
      footer={
        canSwitch ? <ExperimentPeekFooter projectId={projectId} /> : undefined
      }
    >
      {({
        itemType,
        title,
        titleTabs,
        actions,
        itemId,
        detailNavigationKey,
        resolveDetailNavigationPath,
        ...peekControls
      }) => (
        <PeekViewExperimentItemDetail
          projectId={projectId}
          header={{
            variant: "peek",
            headerProps: {
              itemType,
              title,
              titleTabs,
              actions: [
                {
                  id: "experiment-actions",
                  type: "custom",
                  pinned: true,
                  render: () => actions,
                },
                ...createPeekHeaderActions({
                  ...peekControls,
                  navigation:
                    detailNavigationKey && resolveDetailNavigationPath
                      ? {
                          itemId,
                          listKey: detailNavigationKey,
                          resolvePath: resolveDetailNavigationPath,
                        }
                      : undefined,
                }),
              ],
            },
          }}
        />
      )}
    </TablePeekView>
  );
};
