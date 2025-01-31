import { type TableAction } from "@/src/features/table/types";
import { ClipboardPen } from "lucide-react";

const ACTION_MAP: Record<string, TableAction> = {
  "trace-delete": {
    id: "trace-delete",
    type: "delete",
    accessCheck: {
      scope: "traces:delete",
      entitlement: "trace-deletion",
    },
  },
  "trace-add-to-annotation-queue": {
    id: "trace-add-to-annotation-queue",
    type: "create",
    accessCheck: {
      scope: "annotationQueues:CUD",
      entitlement: "annotation-queues",
    },
    createConfig: {
      getTargetOptions: () => [],
      targetLabel: "Annotation Queue",
    },
    icon: <ClipboardPen className="mr-2 h-4 w-4" />,
  },
};

export const getActionConfig = (
  actionId: keyof typeof ACTION_MAP,
): TableAction => {
  return ACTION_MAP[actionId];
};
