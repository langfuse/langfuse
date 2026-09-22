/* eslint-disable @repo/no-style-props */
import { api, type RouterOutputs } from "@/src/utils/api";
import { getNumberFromMap } from "@/src/utils/map-utils";
import { ActionButtonCountBadge } from "@/src/components/ui/action-button-count-badge";
import { Button } from "@/src/components/ui/button";
import { AnnotateDrawerController } from "@/src/features/scores";
import { CommentDrawerController } from "@/src/features/comments";
import { ConnectedTraceObservationAddToDropdownMenuController } from "@/src/features/traces/components/ConnectedTraceObservationAddToDropdownMenuController";
import { cn } from "@/src/utils/tailwind";
import {
  ChevronDown,
  LockIcon,
  MessageSquare,
  MessageSquareOff,
  PlusIcon,
  SquarePen,
} from "lucide-react";

type TraceScores =
  RouterOutputs["sessions"]["byIdWithScores"]["traces"][number]["scores"];

export function SessionTraceActionButtons({
  projectId,
  traceId,
  timestamp,
  environment,
  scores,
  traceCommentCounts,
  isV4,
  density = "default",
  className,
}: {
  projectId: string;
  traceId: string;
  timestamp: Date;
  environment?: string | null;
  scores: TraceScores;
  traceCommentCounts: Map<string, number> | undefined;
  isV4: boolean;
  density?: "default" | "compact";
  className?: string;
}) {
  const size = density === "compact" ? "xs" : "default";
  const commentCount = getNumberFromMap(traceCommentCounts, traceId);
  // SessionIO already fetches the trace, so this doesn't add an extra request
  const trace = api.traces.byId.useQuery(
    {
      traceId,
      projectId,
      timestamp,
    },
    {
      enabled: typeof traceId === "string",
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchOnMount: false,
    },
  );

  return (
    <div className={cn("flex flex-wrap items-start gap-2", className)}>
      {trace.data ? (
        <ConnectedTraceObservationAddToDropdownMenuController
          projectId={projectId}
          traceId={traceId}
          variant="trace"
          input={trace.data.input}
          output={trace.data.output}
          metadata={trace.data.metadata ?? null}
          analyticsData={{ source: "SessionDetail", isV4 }}
        >
          {({ getTriggerProps }) => (
            <Button
              variant="outline"
              size={size}
              className="gap-1.5"
              {...getTriggerProps()}
            >
              <PlusIcon className="h-4 w-4" />
              <span>Add to</span>
              <ChevronDown className="h-3 w-3" />
            </Button>
          )}
        </ConnectedTraceObservationAddToDropdownMenuController>
      ) : null}
      <div className="flex flex-wrap items-start gap-2">
        <AnnotateDrawerController projectId={projectId}>
          {({ disabled, openDrawer }) => (
            <Button
              variant="outline"
              size={size}
              disabled={disabled}
              onClick={() =>
                openDrawer({
                  scoreTarget: { type: "trace", traceId },
                  scores,
                  analyticsData: {
                    type: "trace",
                    source: "SessionDetail",
                    isV4,
                  },
                  scoreMetadata: {
                    projectId,
                    environment: environment ?? undefined,
                  },
                })
              }
            >
              {disabled ? (
                <LockIcon className="mr-1.5 h-3 w-3" />
              ) : (
                <SquarePen className="mr-1.5 h-4 w-4" />
              )}
              <span>Annotate</span>
            </Button>
          )}
        </AnnotateDrawerController>
      </div>
      <CommentDrawerController projectId={projectId} count={commentCount}>
        {({ disabled, openDrawer }) => (
          <Button
            type="button"
            variant="outline"
            size={size}
            disabled={disabled}
            onClick={() =>
              openDrawer({
                type: "comments",
                objectId: traceId,
                objectType: "TRACE",
              })
            }
            className="gap-1"
          >
            {disabled ? (
              <MessageSquareOff className="text-muted-foreground h-4 w-4" />
            ) : (
              <>
                <MessageSquare className="h-4 w-4" />
                <span>Comments</span>
                {!!commentCount ? (
                  <ActionButtonCountBadge count={commentCount} />
                ) : null}
              </>
            )}
          </Button>
        )}
      </CommentDrawerController>
    </div>
  );
}
