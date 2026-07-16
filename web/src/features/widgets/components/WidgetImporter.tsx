import React, { useRef } from "react";
import { Upload } from "lucide-react";

import { type ViewVersion } from "@langfuse/shared/query";
import { type TimeFilter, ObservationLevelDomain } from "@langfuse/shared";
import { api, type RouterOutputs } from "@/src/utils/api";
import { Button } from "@/src/components/ui/button";
import { normalizeSingleValueOptions } from "@/src/features/filters/lib/filter-transform";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import {
  importWidgetFile,
  type ImportedWidgetFormSnapshot,
  type WidgetImportOptionSets,
} from "@/src/features/widgets/utils/import-export-utils";

/** observationLevelOptions is the static set of observation levels always offered on import. */
const observationLevelOptions = ObservationLevelDomain.options.map((value) => ({
  value,
}));

/** WidgetImporter loads a widget JSON export into a form snapshot, owning the file trigger, its v1 option queries, and all toasts. */
export const WidgetImporter = ({
  projectId,
  viewVersion,
  dateRange,
  isBetaEnabled,
  onImport,
}: {
  projectId: string;
  viewVersion: ViewVersion;
  dateRange: { from: Date; to: Date } | undefined;
  isBetaEnabled: boolean;
  onImport: (snapshot: ImportedWidgetFormSnapshot) => void;
}) => {
  const importInputRef = useRef<HTMLInputElement>(null);
  const utils = api.useUtils();

  const handleImportWidget = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    const optionSets = await fetchImportOptionSets({
      utils,
      projectId,
      viewVersion,
      dateRange,
    });

    await runImport({ file, optionSets, isBetaEnabled, onImport });
  };

  return (
    <>
      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleImportWidget}
      />
      <Button
        variant="outline"
        size="sm"
        onClick={() => importInputRef.current?.click()}
      >
        <Upload className="mr-2 h-4 w-4" />
        Import
      </Button>
    </>
  );
};

/** fetchImportOptionSets lazily loads the v1 filter options on import, gated to v1 views, and maps them into the sanitization option sets. */
async function fetchImportOptionSets(params: {
  utils: ReturnType<typeof api.useUtils>;
  projectId: string;
  viewVersion: ViewVersion;
  dateRange: { from: Date; to: Date } | undefined;
}): Promise<WidgetImportOptionSets> {
  if (params.viewVersion !== "v1") {
    return buildImportOptionSets({
      environmentFilterOptionsData: undefined,
      traceFilterOptionsData: undefined,
      generationsFilterOptionsData: undefined,
    });
  }

  const fetchOptions = {
    trpc: { context: { skipBatch: true } },
    staleTime: Infinity,
  };

  const [
    traceFilterOptionsData,
    generationsFilterOptionsData,
    environmentFilterOptionsData,
  ] = await Promise.all([
    params.utils.traces.filterOptions.fetch(
      {
        projectId: params.projectId,
        timestampFilter: getDateRangeFilter("timestamp", params.dateRange),
      },
      fetchOptions,
    ),
    params.utils.generations.filterOptions.fetch(
      {
        projectId: params.projectId,
        startTimeFilter: getDateRangeFilter("startTime", params.dateRange),
        observationType: "ALL",
      },
      fetchOptions,
    ),
    params.utils.projects.environmentFilterOptions.fetch(
      {
        projectId: params.projectId,
        fromTimestamp: params.dateRange?.from,
      },
      fetchOptions,
    ),
  ]);

  return buildImportOptionSets({
    environmentFilterOptionsData,
    traceFilterOptionsData,
    generationsFilterOptionsData,
  });
}

/** buildImportOptionSets maps the v1 filter-option query data into the allowed-value sets for import sanitization. */
function buildImportOptionSets(params: {
  environmentFilterOptionsData:
    | RouterOutputs["projects"]["environmentFilterOptions"]
    | undefined;
  traceFilterOptionsData: RouterOutputs["traces"]["filterOptions"] | undefined;
  generationsFilterOptionsData:
    | RouterOutputs["generations"]["filterOptions"]
    | undefined;
}): WidgetImportOptionSets {
  return {
    environmentValues: params.environmentFilterOptionsData?.map(
      (option) => option.environment,
    ),
    traceNames: params.traceFilterOptionsData
      ? normalizeSingleValueOptions(params.traceFilterOptionsData.name).map(
          (option) => option.value,
        )
      : undefined,
    tags: params.traceFilterOptionsData
      ? params.traceFilterOptionsData.tags.map((option) => option.value)
      : undefined,
    toolNames: params.generationsFilterOptionsData
      ? params.generationsFilterOptionsData.toolNames.map(
          (option) => option.value,
        )
      : undefined,
    calledToolNames: params.generationsFilterOptionsData
      ? params.generationsFilterOptionsData.calledToolNames.map(
          (option) => option.value,
        )
      : undefined,
    modelNames: params.generationsFilterOptionsData
      ? params.generationsFilterOptionsData.model.map((option) => option.value)
      : undefined,
    observationLevels: observationLevelOptions.map((option) => option.value),
  };
}

/** runImport parses the file into a snapshot, applies it via onImport, and raises the malformed, success, and adjusted toasts. */
async function runImport(params: {
  file: File;
  optionSets: WidgetImportOptionSets;
  isBetaEnabled: boolean;
  onImport: (snapshot: ImportedWidgetFormSnapshot) => void;
}): Promise<void> {
  try {
    const result = await importWidgetFile({
      file: params.file,
      optionSets: params.optionSets,
      isBetaEnabled: params.isBetaEnabled,
    });

    params.onImport(result.snapshot);

    showSuccessToast({
      title: "Widget uploaded successfully",
      description: "Widget configuration has been loaded.",
    });

    if (result.removedValues || result.removedFilters) {
      showErrorToast(
        "Widget filters were adjusted",
        "Some imported filters or filter values were removed because they are not available in this project.",
        "WARNING",
      );
    }
  } catch {
    showErrorToast(
      "Malformed input",
      "This operation can't be done due to the malformed input",
      "WARNING",
    );
  }
}

/** getDateRangeFilter builds a bounded time filter for a column from a date range. */
const getDateRangeFilter = (
  column: "timestamp" | "startTime",
  dateRange?: { from: Date; to: Date },
): TimeFilter[] | undefined =>
  dateRange
    ? [
        { column, type: "datetime", operator: ">=", value: dateRange.from },
        { column, type: "datetime", operator: "<=", value: dateRange.to },
      ]
    : undefined;

export const __test = { buildImportOptionSets, runImport };
