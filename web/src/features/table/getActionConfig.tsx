import { type TableAction } from "@/src/features/table/types";
import { ClipboardPen } from "lucide-react";
import { ACTION_ACCESS_MAP, type ActionId } from "@langfuse/shared";

export const getActionConfig = (actionId: ActionId): TableAction | null => {
  const accessCheck = ACTION_ACCESS_MAP[actionId];

  switch (actionId) {
    case "trace-delete":
      return {
        id: actionId,
        type: "delete",
        accessCheck,
        translateToMutationInput: (params: {
          projectId: string;
          itemIds: string[];
        }) => ({
          projectId: params.projectId,
          traceIds: params.itemIds,
        }),
      };
    case "trace-add-to-annotation-queue":
      return {
        id: actionId,
        type: "create",
        accessCheck,
        translateToMutationInput: (params: {
          projectId: string;
          targetId: string;
          itemIds: string[];
        }) => ({
          projectId: params.projectId,
          queueId: params.targetId, // map targetId to queueId
          objectIds: params.itemIds, // map selectedIds to objectIds
          objectType: "TRACE", // hardcode the object type
        }),
        queryConfig: {
          targetLabel: "Annotation Queue",
          targetQueryRoute: "annotationQueues.allNamesAndIds" as const, // tRPC route
          entitlement: "annotation-queues" as const, // entitlement
        },
        icon: <ClipboardPen className="mr-2 h-4 w-4" />,
      };
    default:
      return null;
  }
};
