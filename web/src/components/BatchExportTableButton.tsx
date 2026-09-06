/* eslint-disable @repo/no-abstracted-overlay-trigger */
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
import Spinner from "@/src/components/design-system/Spinner/Spinner";
import { Download, Info } from "lucide-react";
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
import { useTranslations } from "next-intl";

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
  const t = useTranslations("commonActions.export");
  const [isExporting, setIsExporting] = React.useState(false);
  const createExport = api.batchExport.create.useMutation({
    onSettled: () => {
      setIsExporting(false);
    },
    onSuccess: () => {
      showSuccessToast({
        title: t("queued"),
        description: t("emailNotice"),
        duration: 10000,
        link: {
          href: `/project/${props.projectId}/settings/exports`,
          text: t("viewExports"),
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
      name: `${new Date().toISOString()} - ${props.tableName} ${t("asFormat", { format })}`,
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
        return t("warnings.traces");
      case BatchTableNames.Observations:
        return t("warnings.observations");
      case BatchTableNames.Events:
        return t("warnings.events");
      case BatchTableNames.Sessions:
        return t("warnings.sessions");
      case BatchTableNames.AuditLogs:
        return t("warnings.auditLogs");
      default:
        // Note: for Scores, DatasetRunItems, DatasetItems, filters should work as expected
        return null;
    }
  };

  const warningMessage = getWarningMessage();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" title={t("action")}>
          {isExporting ? (
            <Spinner size="sm" />
          ) : (
            <Download className="h-4 w-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent className="w-80">
          <DropdownMenuLabel>{t("action")}</DropdownMenuLabel>
          {warningMessage && (
            <div className="text-muted-foreground px-2 py-1.5 text-xs">
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
              onClick={() => handleExport(key as BatchExportFileFormat)}
            >
              {t("asFormat", { format: options.label })}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenu>
  );
};
