import { DatasetForm } from "@/src/features/datasets/components/DatasetForm";
import type { DatasetCreateStepProps } from "./types";
import { useTranslations } from "next-intl";

export function DatasetCreateStep(props: DatasetCreateStepProps) {
  const t = useTranslations("operationsUi.batchActions.addToDataset.create");
  const { projectId, formRef, onDatasetCreated, onValidationChange } = props;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h3 className="text-lg font-bold">{t("title")}</h3>
        <p className="text-muted-foreground text-sm">{t("description")}</p>
      </div>

      <DatasetForm
        ref={formRef}
        projectId={projectId}
        mode="create"
        redirectOnSuccess={false}
        showFooter={false}
        onCreateDatasetSuccess={onDatasetCreated}
        onValidationChange={onValidationChange}
      />
    </div>
  );
}
