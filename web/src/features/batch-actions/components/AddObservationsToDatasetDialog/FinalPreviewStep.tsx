import { useMemo } from "react";
import { Button } from "@/src/components/ui/button";
import { Pencil } from "lucide-react";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { cn } from "@/src/utils/tailwind";
import type { FinalPreviewStepProps, DialogStep } from "./types";
import { applyFullMapping, type MappingError } from "@langfuse/shared";
import {
  IssueBanner,
  issueCardVariants,
  issueChromeVariants,
  issueIcons,
  issueTextVariants,
  type IssueVariant,
} from "@/src/features/batch-actions/components/AddObservationsToDatasetDialog/components/IssueBanner";
import { useTranslations } from "next-intl";

const STEP_FOR_FIELD: Record<string, DialogStep> = {
  input: "input-mapping",
  expectedOutput: "output-mapping",
  metadata: "metadata-mapping",
};

export function FinalPreviewStep({
  dataset,
  mapping,
  observationData,
  totalCount,
  onEditStep,
}: FinalPreviewStepProps) {
  const t = useTranslations("operationsUi.batchActions.addToDataset");
  const previewResult = useMemo(() => {
    if (!observationData) return null;

    return applyFullMapping({
      observation: {
        input: observationData.input,
        output: observationData.output,
        metadata: observationData.metadata,
      },
      mapping,
    });
  }, [observationData, mapping]);

  const { errorsByField, missesByField, errorFields, missFields } =
    useMemo(() => {
      const errorsByField: Record<string, MappingError[]> = {};
      const missesByField: Record<string, MappingError[]> = {};
      for (const err of previewResult?.errors ?? []) {
        const bucket =
          err.type === "json_path_error" ? errorsByField : missesByField;
        (bucket[err.targetField] ??= []).push(err);
      }
      return {
        errorsByField,
        missesByField,
        errorFields: Object.keys(errorsByField),
        missFields: Object.keys(missesByField),
      };
    }, [previewResult?.errors]);

  return (
    <div className="h-[62vh] space-y-6 p-6">
      <div>
        <h3 className="text-lg font-bold">{t("review.title")}</h3>
        <p className="text-muted-foreground text-sm">
          {t("review.summary", { count: totalCount, dataset: dataset.name })}
        </p>
      </div>

      {errorFields.length > 0 && (
        <IssueBanner
          variant="error"
          title={t("review.invalidTitle")}
          description={t("review.invalidDescription")}
        >
          <EditMappingActions
            variant="error"
            fields={errorFields}
            onEditStep={onEditStep}
          />
        </IssueBanner>
      )}

      {missFields.length > 0 && (
        <IssueBanner
          variant="warning"
          title={t("review.missTitle")}
          description={t("review.missDescription")}
        >
          <EditMappingActions
            variant="warning"
            fields={missFields}
            onEditStep={onEditStep}
          />
        </IssueBanner>
      )}

      <div className="text-muted-foreground text-sm">
        {t("review.sampleDescription")}
      </div>

      {!observationData ? (
        <div className="bg-muted/30 flex h-64 items-center justify-center rounded-md border p-4">
          <p className="text-muted-foreground text-sm">
            {t("review.noObservation")}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <PreviewCard
            label={t("fields.input")}
            data={previewResult?.input}
            onEdit={() => onEditStep("input-mapping")}
            pathErrors={errorsByField["input"]}
            pathMisses={missesByField["input"]}
          />
          <PreviewCard
            label={t("fields.expectedOutput")}
            data={previewResult?.expectedOutput}
            onEdit={() => onEditStep("output-mapping")}
            pathErrors={errorsByField["expectedOutput"]}
            pathMisses={missesByField["expectedOutput"]}
          />
          <PreviewCard
            label={t("fields.metadata")}
            data={previewResult?.metadata}
            onEdit={() => onEditStep("metadata-mapping")}
            pathErrors={errorsByField["metadata"]}
            pathMisses={missesByField["metadata"]}
          />
        </div>
      )}
    </div>
  );
}

function EditMappingActions({
  variant,
  fields,
  onEditStep,
}: {
  variant: IssueVariant;
  fields: string[];
  onEditStep: (step: DialogStep) => void;
}) {
  const t = useTranslations("operationsUi.batchActions.addToDataset");

  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {fields.map((field) => (
        <Button
          key={field}
          variant="link"
          size="sm"
          className={cn(
            "h-auto p-0 text-xs underline",
            issueTextVariants({ variant }),
          )}
          onClick={() => {
            const step = STEP_FOR_FIELD[field];
            if (step) onEditStep(step);
          }}
        >
          {t("review.editMapping", {
            field:
              field === "expectedOutput"
                ? t("fields.expectedOutput")
                : t(`fields.${field as "input" | "metadata"}`),
          })}
        </Button>
      ))}
    </div>
  );
}

type PreviewCardProps = {
  label: string;
  data: unknown;
  onEdit: () => void;
  pathErrors?: MappingError[];
  pathMisses?: MappingError[];
};

function PreviewCard({
  label,
  data,
  onEdit,
  pathErrors = [],
  pathMisses = [],
}: PreviewCardProps) {
  const t = useTranslations("operationsUi.batchActions.addToDataset.review");
  const variant: IssueVariant | null =
    pathErrors.length > 0 ? "error" : pathMisses.length > 0 ? "warning" : null;
  const Icon = variant ? issueIcons[variant] : null;

  return (
    <div className={issueCardVariants({ variant: variant ?? "none" })}>
      <div className="bg-muted/30 flex items-center justify-between border-b px-4 py-2">
        <span className="flex items-center gap-1.5 text-sm font-bold">
          {Icon && variant && (
            <Icon
              className={cn("h-3.5 w-3.5", issueTextVariants({ variant }))}
            />
          )}
          {label}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onEdit}
          className="h-7 gap-1 text-xs"
        >
          <Pencil className="h-3 w-3" />
          {t("edit")}
        </Button>
      </div>
      <div className="max-h-62 overflow-auto">
        {data === null ? (
          <div className="text-muted-foreground p-4 text-sm italic">null</div>
        ) : (
          <JSONView json={data} className="text-xs" />
        )}
      </div>
      {variant && (
        <div
          className={cn("border-t px-4 py-2", issueChromeVariants({ variant }))}
        >
          <p className="text-xs">
            {t("issueSummary", {
              issues: [
                pathErrors.length > 0 &&
                  t("invalidPathCount", { count: pathErrors.length }),
                pathMisses.length > 0 &&
                  t("missedPathCount", { count: pathMisses.length }),
              ]
                .filter(Boolean)
                .join(t("issueSeparator")),
            })}
          </p>
        </div>
      )}
    </div>
  );
}
