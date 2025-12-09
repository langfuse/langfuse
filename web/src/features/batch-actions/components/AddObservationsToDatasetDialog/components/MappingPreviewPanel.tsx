import { useMemo } from "react";
import { ArrowDown } from "lucide-react";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { Skeleton } from "@/src/components/ui/skeleton";
import type {
  FieldMappingConfig,
  SourceField,
  ObservationPreviewData,
} from "../types";
import { applyFieldMappingConfig } from "@langfuse/shared";

type MappingPreviewPanelProps = {
  fieldLabel: string;
  defaultSourceField: SourceField;
  config: FieldMappingConfig;
  observationData: ObservationPreviewData | null;
  isLoading: boolean;
};

export function MappingPreviewPanel({
  fieldLabel,
  defaultSourceField,
  config,
  observationData,
  isLoading,
}: MappingPreviewPanelProps) {
  // Compute source data to display
  const sourceData = useMemo(() => {
    if (!observationData) return null;

    // Determine which source field to show based on config
    if (config.mode === "custom" && config.custom) {
      if (config.custom.type === "root" && config.custom.rootConfig) {
        return observationData[config.custom.rootConfig.sourceField];
      }
      // For keyValueMap type, show the default source field
      return observationData[defaultSourceField];
    }

    return observationData[defaultSourceField];
  }, [observationData, config, defaultSourceField]);

  // Compute result data
  const resultData = useMemo(() => {
    if (!observationData) return null;

    return applyFieldMappingConfig({
      observation: {
        input: observationData.input,
        output: observationData.output,
        metadata: observationData.metadata,
      },
      config,
      defaultSourceField,
    });
  }, [observationData, config, defaultSourceField]);

  // Determine source label based on config
  const sourceLabel = useMemo(() => {
    if (config.mode === "custom" && config.custom) {
      if (config.custom.type === "root" && config.custom.rootConfig) {
        return `observation.${config.custom.rootConfig.sourceField}`;
      }
      if (config.custom.type === "keyValueMap") {
        // For keyValueMap type, multiple sources may be used
        const sources = new Set(
          config.custom.keyValueMapConfig?.entries.map((e) => e.sourceField) ??
            [],
        );
        if (sources.size === 1) {
          return `observation.${Array.from(sources)[0]}`;
        }
        return "multiple sources";
      }
    }
    return `observation.${defaultSourceField}`;
  }, [config, defaultSourceField]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Preview</h3>
          <p className="text-xs text-muted-foreground">
            Sample from first observation
          </p>
        </div>
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!observationData) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Preview</h3>
          <p className="text-xs text-muted-foreground">
            Sample from first observation
          </p>
        </div>
        <div className="flex h-64 items-center justify-center rounded-md border bg-muted/30 p-4">
          <p className="text-sm text-muted-foreground">
            No observation data available
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-7 h-full space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Preview</h3>
        <p className="text-xs text-muted-foreground">
          Sample from first observation
        </p>
      </div>

      {/* Source data */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">
          Source: {sourceLabel}
        </p>
        <div className="max-h-[22vh] overflow-auto rounded-md border bg-muted/30">
          <JSONView json={sourceData} className="text-xs" />
        </div>
      </div>

      {/* Arrow */}
      <div className="flex justify-center">
        <ArrowDown className="h-5 w-5 text-muted-foreground" />
      </div>

      {/* Result data */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">
          Result: Dataset Item {fieldLabel}
        </p>
        <div className="max-h-[22vh] overflow-auto rounded-md border bg-background">
          {config.mode === "none" ? (
            <div className="p-3 text-xs italic text-muted-foreground">null</div>
          ) : (
            <JSONView json={resultData} className="text-xs" />
          )}
        </div>
      </div>
    </div>
  );
}
