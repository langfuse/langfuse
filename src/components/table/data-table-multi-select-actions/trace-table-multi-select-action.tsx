/* eslint-disable */
// @ts-nocheck

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/src/components/ui/dropdown-menu";
import { DeleteTraceMultiSelectAction } from "@/src/components/delete-trace";
import { Button } from "@/src/components/ui/button";
import { ChevronDown } from "lucide-react";

export function TraceTableMultiSelectAction({
  selectedRows,
  projectId,
}: {
  selectedRows: object[];
  projectId: string;
}) {
  const traceIds = selectedRows.map((row) => {
    const trace = row.original;
    const traceId: string = trace.id;
    return traceId; 
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="bg-white p-2 font-medium text-black"
          disabled={selectedRows.length < 1}
        >
          Actions
          <ChevronDown className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="text-center">
        <DropdownMenuItem>
          <DeleteTraceMultiSelectAction
            traceIds={traceIds}
            projectId={projectId}
          />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
