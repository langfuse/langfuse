import { ChevronDown } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/src/components/ui/dropdown-menu";
import { Button } from "@/src/components/ui/button";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { api } from "@/src/utils/api";
import { type TraceTableRow } from "@/src/components/table/use-cases/traces";

export function TraceTableMultiSelectAction({
  selectedRows,
  projectId,
}: {
  selectedRows: TraceTableRow[];
  projectId: string;
}) {
  const utils = api.useUtils();

  const hasAccess = useHasAccess({ projectId, scope: "traces:delete" });

  const mutDeleteTraces = api.traces.deleteMany.useMutation({
    onSuccess: () => void utils.traces.invalidate(),
  });

  const traceIds = selectedRows.map((row) => row.id);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="bg-white p-2 font-medium text-black"
          disabled={selectedRows.length < 1}
        >
          Actions ({selectedRows.length} selected)
          <ChevronDown className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem
          disabled={!hasAccess}
          onClick={() =>
            void mutDeleteTraces.mutateAsync({ traceIds, projectId })
          }
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
