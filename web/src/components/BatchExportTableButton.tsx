import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/src/components/ui/dropdown-menu";
import { Button } from "@/src/components/ui/button";
import { Download, Loader, Info } from "lucide-react";
import {
  type BatchExportTableName,
  exportOptions,
  type BatchExportFileFormat,
  type OrderByState,
  BatchTableNames,
} from "@langfuse/shared";
import React from "react";
import { api } from "@/src/utils/api";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";

export type BatchExportTableButtonProps = {
  projectId: string;
  tableName: BatchExportTableName;
  orderByState: OrderByState;
  filterState: any;
  searchQuery?: any;
  searchType?: any;
};

export const BatchExportTableButton: React.FC<BatchExportTableButtonProps> = (
  props,
) => {
  const [isExporting, setIsExporting] = React.useState(false);
  const createExport = api.batchExport.create.useMutation({
    onSettled: () => {
      setIsExporting(false);
    },
    onSuccess: () => {
      showSuccessToast({
        title: "Export queued",
        description: "You will receive an email when the export is ready.",
        duration: 10000,
        link: {
          href: `/project/${props.projectId}/settings/exports`,
          text: "View exports",
        },
      });
    },
  });
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "batchExports:create",
  });

  const handleExport = async (format: BatchExportFileFormat) => {
    setIsExporting(true);
    await createExport.mutateAsync({
      projectId: props.projectId,
      name: `${new Date().toISOString()} - ${props.tableName} as ${format}`,
      format,
      query: {
        tableName: props.tableName,
        filter: props.filterState,
        searchQuery: props.searchQuery || undefined,
        searchType: props.searchType || undefined,
        orderBy: props.orderByState,
      },
    });
  };

  if (!hasAccess) return null;

  const getWarningMessage = () => {
    switch (props.tableName) {
      case BatchTableNames.Traces:
        return "Note: Filters on observation-level columns (Level, Tokens, Cost, Latency) and Comments are not included in trace exports. You may receive more data than expected.";
      case BatchTableNames.Observations:
        return "Note: Filters on trace-level columns (Trace Name, Trace Tags, User ID, Trace Environment) and Comments are not included in observation exports. You may receive more data than expected.";
      case BatchTableNames.Events:
        return "Note: Filters on Comments are not included in event exports. You may receive more data than expected.";
      case BatchTableNames.Sessions:
        return "Note: Filters on Comments are not included in session exports. You may receive more data than expected.";
      case BatchTableNames.AuditLogs:
        return "Note: Filters are not applied to audit log exports. All audit logs for this project will be exported.";
      default:
        // Note: for Scores, DatasetRunItems, DatasetItems, filters should work as expected
        return null;
    }
  };

  const warningMessage = getWarningMessage();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" title="Export">
          {isExporting ? (
            <Loader className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent className="w-80">
          <DropdownMenuLabel>Export</DropdownMenuLabel>
          {warningMessage && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              <div className="flex items-start gap-1.5">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{warningMessage}</span>
              </div>
            </div>
          )}
          <DropdownMenuSeparator />
          {Object.entries(exportOptions).map(([key, options]) => (
            <DropdownMenuItem
              key={key}
              className="capitalize"
              onClick={() => void handleExport(key as BatchExportFileFormat)}
            >
              as {options.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenu>
  );
};
