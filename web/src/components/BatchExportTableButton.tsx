import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { Button } from "@/src/components/ui/button";
import { Spinner } from "@/src/components/design-system/Spinner/Spinner";
import { Download } from "@langfuse/icons";
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

export type BatchExportTableButtonProps = {
  projectId: string;
  tableName: BatchExportTableName;
  orderByState: OrderByState;
  filterState: any;
  searchQuery?: any;
  searchType?: any;
  disabledReason?: string;
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
        operation: "export.queue",
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
    <DropdownMenu
      title="Export"
      description={warningMessage ?? undefined}
      emptyText={props.disabledReason}
      width="wide"
      items={
        props.disabledReason
          ? []
          : Object.entries(exportOptions).map(([key, options]) => ({
              type: "item",
              id: key,
              title: `As ${options.label}`,
              onClick: () => handleExport(key as BatchExportFileFormat),
            }))
      }
    >
      {({ getTriggerProps }) => (
        <Button
          {...getTriggerProps()}
          variant="ghost"
          size="icon"
          title="Export"
          className="hidden md:inline-flex"
        >
          {isExporting ? (
            <Spinner size="sm" />
          ) : (
            <Download size="base" color="default" />
          )}
        </Button>
      )}
    </DropdownMenu>
  );
};
