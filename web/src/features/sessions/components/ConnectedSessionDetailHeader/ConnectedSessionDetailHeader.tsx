import {
  ObservabilityEntityDetailHeader,
  type EntityDetailHeaderProps,
  type HeaderMetric,
} from "@/src/components/ObservabilityEntityDetailHeader/ObservabilityEntityDetailHeader";
import { AnnotationQueueSubmenuItemController } from "@/src/features/annotation-queues/components/AnnotationQueueSubmenuItemController";
import {
  AnnotateDrawerController,
  type AnnotateDrawerPayload,
} from "@/src/features/scores/components/AnnotateDrawerController";
import { CommentDrawerController } from "@/src/features/comments/CommentDrawerController";
import { AnnotationQueueObjectType } from "@langfuse/shared";
import { MessageSquare, Plus, SquarePen } from "@langfuse/icons";

export function ConnectedSessionDetailHeader({
  projectId,
  sessionId,
  isV4,
  annotation,
  annotationCount,
  commentCount,
  headerProps,
  metrics,
  isLoading,
}: {
  projectId: string;
  sessionId: string;
  isV4: boolean;
  annotation: AnnotateDrawerPayload<{ type: "session"; sessionId: string }>;
  annotationCount?: number;
  commentCount: number;
  headerProps: EntityDetailHeaderProps;
  metrics: readonly HeaderMetric[];
  isLoading?: boolean;
}) {
  return (
    <AnnotationQueueSubmenuItemController
      projectId={projectId}
      objectId={sessionId}
      objectType={AnnotationQueueObjectType.SESSION}
      analyticsData={{ source: "SessionDetail", isV4 }}
    >
      {({ item, totalCount }) => (
        <AnnotateDrawerController projectId={projectId}>
          {({ disabled: annotationDisabled, openDrawer: annotate }) => (
            <CommentDrawerController projectId={projectId} count={commentCount}>
              {({ disabled: commentDisabled, openDrawer: comment }) => (
                <ObservabilityEntityDetailHeader
                  variant="page"
                  isLoading={isLoading}
                  metrics={metrics}
                  headerProps={{
                    ...headerProps,
                    actions: [
                      {
                        id: "add-to",
                        type: "dropdown",
                        label: "Add to",
                        icon: Plus,
                        items: [item],
                        count: totalCount,
                        disabled: isLoading,
                      },
                      {
                        id: "annotate",
                        type: "button",
                        label: "Annotate",
                        count: annotationCount,
                        icon: SquarePen,
                        disabled: annotationDisabled || isLoading,
                        onClick: () => annotate(annotation),
                      },
                      {
                        id: "comment",
                        type: "button",
                        label: commentCount > 0 ? "Comments" : "Comment",
                        count: commentCount,
                        icon: MessageSquare,
                        disabled: commentDisabled || isLoading,
                        onClick: () =>
                          comment({
                            type: "comments",
                            objectId: sessionId,
                            objectType: "SESSION",
                          }),
                      },
                      ...(headerProps.actions ?? []),
                    ],
                  }}
                />
              )}
            </CommentDrawerController>
          )}
        </AnnotateDrawerController>
      )}
    </AnnotationQueueSubmenuItemController>
  );
}
