import { useMemo, useEffect, useRef } from "react";
import {
  ArrowDown,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  IssueList,
  IssueItem,
} from "@/src/features/batch-actions/components/AddObservationsToDatasetDialog/components/IssueBanner";
import type {
  FieldMappingConfig,
  SourceField,
  ObservationPreviewData,
  SchemaValidationError,
} from "../types";
import {
  applyFieldMappingConfig,
  validateFieldAgainstSchema,
  type JsonPathMissInfo,
  type JsonPathErrorInfo,
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

  // Compute result data and collect JSONPath misses / syntax errors
  const { resultData, jsonPathMisses, jsonPathErrors } = useMemo(() => {
    if (!observationData)
      return {
        resultData: null,
        jsonPathMisses: [] as JsonPathMissInfo[],
        jsonPathErrors: [] as JsonPathErrorInfo[],
      };

    const result = applyFieldMappingConfig({
      observation: {
        input: observationData.input,
        output: observationData.output,
        metadata: observationData.metadata,
      },
      config,
      defaultSourceField,
    });

    return {
      resultData: result.value,
      jsonPathMisses: result.misses,
      jsonPathErrors: result.errors,
    };
  }, [observationData, config, defaultSourceField]);

  // Validate result against schema, and treat JSONPath syntax errors as validation failures
  const validationResult = useMemo(() => {
    const jsonPathErrorItems: SchemaValidationError[] = jsonPathErrors.map(
      (err) => ({
        path: err.mappingKey
          ? `${err.sourceField} (key: "${err.mappingKey}")`
          : err.sourceField,
        message: `Invalid JSONPath "${err.jsonPath}": ${err.message}`,
      }),
    );

    // Any JSONPath syntax error blocks the mapping regardless of schema
    if (jsonPathErrorItems.length > 0) {
      return { isValid: false, errors: jsonPathErrorItems };
    }

    // Skip schema validation if no schema or "none" mode
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
      // If schema validation fails to run, treat as valid (don't block on validation errors)
      return { isValid: true, errors: [] as SchemaValidationError[] };
    }
  }, [hasSchema, config.mode, resultData, schema, jsonPathErrors]);

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
          <p className="text-muted-foreground text-xs">
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
          <p className="text-muted-foreground text-xs">
            Sample from first observation
          </p>
        </div>
        <div className="bg-muted/30 flex h-64 items-center justify-center rounded-md border p-4">
          <p className="text-muted-foreground text-sm">
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
        <p className="text-muted-foreground text-xs">
          Sample from first observation
        </p>
      </div>

      {/* Source data */}
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs font-medium">
          Source: {sourceLabel}
        </p>
        <div className="bg-muted/30 max-h-[21vh] overflow-auto rounded-md border">
          <JSONView json={sourceData} className="text-xs" />
        </div>
      </div>

      {/* Arrow */}
      <div className="flex justify-center">
        <ArrowDown className="text-muted-foreground h-6 w-6" />
      </div>

      {/* Result data */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <p className="text-muted-foreground text-xs font-medium">
            Result: Dataset Item {fieldLabel}
          </p>
          {/* Validation status indicator */}
          {config.mode !== "none" && (
            <div className="flex items-center gap-1">
              {jsonPathErrors.length > 0 ||
              (hasSchema && !validationResult.isValid) ? (
                <AlertCircle className="text-destructive h-3.5 w-3.5" />
              ) : jsonPathMisses.length > 0 ? (
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-500" />
              ) : hasSchema ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
              ) : null}
            </div>
          )}
        </div>
        <div
          className={`bg-background max-h-[21vh] overflow-auto rounded-md border ${
            (jsonPathErrors.length > 0 ||
              (hasSchema && !validationResult.isValid)) &&
            config.mode !== "none"
              ? "border-destructive"
              : jsonPathMisses.length > 0 && config.mode !== "none"
                ? "border-amber-500/50"
                : ""
          }`}
        >
          {config.mode === "none" ? (
            <div className="text-muted-foreground p-3 text-xs italic">null</div>
          ) : (
            <JSONView json={resultData} className="text-xs" />
          )}
        </div>

        {/* JSONPath syntax errors (always blocking) */}
        {jsonPathErrors.length > 0 && config.mode !== "none" && (
          <IssueList variant="error" title="Invalid JSONPath:">
            {jsonPathErrors.map((err, idx) => (
              <IssueItem key={idx}>
                <span className="font-mono">{err.jsonPath}</span>
                {err.mappingKey ? ` (key: "${err.mappingKey}")` : ""}:{" "}
                {err.message}
              </IssueItem>
            ))}
          </IssueList>
        )}

        {/* Schema validation errors (only when no blocking JSONPath errors) */}
        {hasSchema &&
          jsonPathErrors.length === 0 &&
          validationResult.errors.length > 0 && (
            <IssueList variant="error" title="Schema validation errors:">
              {validationResult.errors.map((error, idx) => (
                <IssueItem key={idx}>
                  <span className="font-mono">{error.path || "root"}</span>:{" "}
                  {error.message}
                </IssueItem>
              ))}
            </IssueList>
          )}

        {/* JSONPath warnings */}
        {jsonPathMisses.length > 0 && config.mode !== "none" && (
          <IssueList
            variant="warning"
            title="JSONPath warnings (preview observation):"
          >
            {jsonPathMisses.map((miss, idx) => (
              <IssueItem key={idx}>
                <span className="font-mono">{miss.jsonPath}</span> did not match
                any data in {miss.sourceField}
                {miss.mappingKey ? ` (key: "${miss.mappingKey}")` : ""}
              </IssueItem>
            ))}
          </IssueList>
        )}
      </div>
    </div>
  );
}
