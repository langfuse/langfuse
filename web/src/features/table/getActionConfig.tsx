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
      };
    case "trace-add-to-annotation-queue":
      return {
        id: actionId,
        type: "create",
        accessCheck,
        createConfig: {
          getTargetOptions: () => [],
          targetLabel: "Annotation Queue",
        },
        icon: <ClipboardPen className="mr-2 h-4 w-4" />,
      };
    default:
      return null;
  }
};
