import { useMemo, useEffect, useRef } from "react";
import {
  ArrowDown,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { Skeleton } from "@/src/components/ui/skeleton";
import type {
  FieldMappingConfig,
  SourceField,
  ObservationPreviewData,
  SchemaValidationError,
} from "../types";
import {
  applyFieldMappingConfig,
  validateFieldAgainstSchema,
} from "@langfuse/shared";

type MappingPreviewPanelProps = {
  fieldLabel: string;
  defaultSourceField: SourceField;
  config: FieldMappingConfig;
  observationData: ObservationPreviewData | null;
  isLoading: boolean;
  /** JSON Schema to validate the result against */
  schema?: unknown;
  /** Callback when validation state changes */
  onValidationChange?: (
    isValid: boolean,
    errors: SchemaValidationError[],
  ) => void;
};

export function MappingPreviewPanel({
  fieldLabel,
  defaultSourceField,
  config,
  observationData,
  isLoading,
  schema,
  onValidationChange,
}: MappingPreviewPanelProps) {
  const hasSchema = schema !== null && schema !== undefined;

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

  // Compute result data and collect JSON path misses
  const { resultData, jsonPathMisses } = useMemo(() => {
    if (!observationData)
      return {
        resultData: null,
        jsonPathMisses: [] as {
          sourceField: string;
          jsonPath: string;
          mappingKey: string | null;
        }[],
      };

    const misses: {
      sourceField: string;
      jsonPath: string;
      mappingKey: string | null;
    }[] = [];

    const data = applyFieldMappingConfig({
      observation: {
        input: observationData.input,
        output: observationData.output,
        metadata: observationData.metadata,
      },
      config,
      defaultSourceField,
      onJsonPathMiss: (info) => {
        misses.push(info);
      },
    });

    return { resultData: data, jsonPathMisses: misses };
  }, [observationData, config, defaultSourceField]);

  // Validate result against schema
  const validationResult = useMemo(() => {
    // Skip validation if no schema or "none" mode
    if (!hasSchema || config.mode === "none") {
      return { isValid: true, errors: [] as SchemaValidationError[] };
    }

    // Skip if no result data (no observation)
    if (resultData === null || resultData === undefined) {
      return { isValid: true, errors: [] as SchemaValidationError[] };
    }

    try {
      const result = validateFieldAgainstSchema({
        data: resultData,
        schema: schema as Record<string, unknown>,
      });

      if (result.isValid) {
        return { isValid: true, errors: [] as SchemaValidationError[] };
      }

      return {
        isValid: false,
        errors: result.errors.map((e) => ({
          path: e.path,
          message: e.message,
        })),
      };
    } catch {
      // If validation fails to run, treat as valid (don't block on validation errors)
      return { isValid: true, errors: [] as SchemaValidationError[] };
    }
  }, [hasSchema, config.mode, resultData, schema]);

  // Track previous validation state to avoid redundant callbacks
  const prevValidationRef = useRef<{
    isValid: boolean;
    errorsJson: string;
  } | null>(null);

  // Notify parent of validation state changes (only when values actually change)
  useEffect(() => {
    const errorsJson = JSON.stringify(validationResult.errors);
    const prev = prevValidationRef.current;

    // Only call if values actually changed
    if (
      !prev ||
      prev.isValid !== validationResult.isValid ||
      prev.errorsJson !== errorsJson
    ) {
      prevValidationRef.current = {
        isValid: validationResult.isValid,
        errorsJson,
      };
      onValidationChange?.(validationResult.isValid, validationResult.errors);
    }
  }, [validationResult.isValid, validationResult.errors, onValidationChange]);

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
    <div className="space-y-2">
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
        <div className="max-h-[21vh] overflow-auto rounded-md border bg-muted/30">
          <JSONView json={sourceData} className="text-xs" />
        </div>
      </div>

      {/* Arrow */}
      <div className="flex justify-center">
        <ArrowDown className="h-6 w-6 text-muted-foreground" />
      </div>

      {/* Result data */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <p className="text-xs font-medium text-muted-foreground">
            Result: Dataset Item {fieldLabel}
          </p>
          {/* Validation status indicator */}
          {config.mode !== "none" && (
            <div className="flex items-center gap-1">
              {hasSchema && !validationResult.isValid ? (
                <AlertCircle className="h-3.5 w-3.5 text-destructive" />
              ) : jsonPathMisses.length > 0 ? (
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-500" />
              ) : hasSchema ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
              ) : null}
            </div>
          )}
        </div>
        <div
          className={`max-h-[21vh] overflow-auto rounded-md border bg-background ${
            hasSchema && !validationResult.isValid && config.mode !== "none"
              ? "border-destructive"
              : jsonPathMisses.length > 0 && config.mode !== "none"
                ? "border-amber-500/50"
                : ""
          }`}
        >
          {config.mode === "none" ? (
            <div className="p-3 text-xs italic text-muted-foreground">null</div>
          ) : (
            <JSONView json={resultData} className="text-xs" />
          )}
        </div>

        {/* Validation errors */}
        {hasSchema &&
          !validationResult.isValid &&
          validationResult.errors.length > 0 && (
            <div className="max-h-[5vh] overflow-y-auto rounded-md border border-destructive/50 bg-destructive/10 p-2">
              <p className="mb-1 text-xs font-medium text-destructive">
                Schema validation errors:
              </p>
              <ul className="space-y-0.5">
                {validationResult.errors.map((error, idx) => (
                  <li key={idx} className="text-xs text-destructive">
                    <span className="font-mono">{error.path || "root"}</span>:{" "}
                    {error.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

        {/* JSON path warnings */}
        {jsonPathMisses.length > 0 && config.mode !== "none" && (
          <div className="max-h-[5vh] overflow-y-auto rounded-md border border-amber-500/50 bg-amber-50 p-2 dark:bg-amber-950/30">
            <p className="mb-1 text-xs font-medium text-amber-600 dark:text-amber-500">
              JSON path warnings (preview observation):
            </p>
            <ul className="space-y-0.5">
              {jsonPathMisses.map((miss, idx) => (
                <li
                  key={idx}
                  className="text-xs text-amber-600 dark:text-amber-500"
                >
                  <span className="font-mono">{miss.jsonPath}</span> did not
                  match any data in {miss.sourceField}
                  {miss.mappingKey ? ` (key: "${miss.mappingKey}")` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
