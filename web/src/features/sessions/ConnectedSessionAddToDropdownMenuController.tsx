import { AnnotationQueueObjectType } from "@langfuse/shared";
import { type ComponentProps, type ReactNode } from "react";

import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { AnnotationQueueSubmenuItemController } from "@/src/features/annotation-queues";
import { type AnalyticsData } from "@/src/features/scores/types";

type TriggerControls = Parameters<
  ComponentProps<typeof DropdownMenu>["children"]
>[0];

export function ConnectedSessionAddToDropdownMenuController({
  projectId,
  sessionId,
  analyticsData,
  children,
}: {
  projectId: string;
  sessionId: string;
  analyticsData: Pick<AnalyticsData, "source" | "isV4">;
  children: (controls: TriggerControls & { totalCount: number }) => ReactNode;
}) {
  return (
    <AnnotationQueueSubmenuItemController
      projectId={projectId}
      objectId={sessionId}
      objectType={AnnotationQueueObjectType.SESSION}
      analyticsData={analyticsData}
    >
      {({ item, totalCount }) => (
        <DropdownMenu items={[item]} maxHeight="24rem" placement="bottom-start">
          {({ getTriggerProps }) => children({ getTriggerProps, totalCount })}
        </DropdownMenu>
      )}
    </AnnotationQueueSubmenuItemController>
  );
}
