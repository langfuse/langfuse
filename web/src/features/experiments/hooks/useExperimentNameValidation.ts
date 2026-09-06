import { api } from "@/src/utils/api";
import { useUniqueNameValidation } from "@/src/hooks/useUniqueNameValidation";
import { type UseFormReturn } from "react-hook-form";
import { useMemo } from "react";
import { useTranslations } from "next-intl";

type ExperimentNameValidationProps = {
  projectId: string;
  datasetId: string;
  form: UseFormReturn<any>;
};

export function useExperimentNameValidation({
  projectId,
  datasetId,
  form,
}: ExperimentNameValidationProps) {
  const t = useTranslations("evaluationAnalytics.experiments");
  const runNamesByDatasetId = api.datasets.baseRunDataByDatasetId.useQuery(
    { projectId, datasetId },
    { enabled: Boolean(datasetId) },
  );

  const allExperimentNames = useMemo(() => {
    return (
      runNamesByDatasetId.data?.map((experiment) => ({
        value: experiment.name,
      })) ?? []
    );
  }, [runNamesByDatasetId.data]);

  useUniqueNameValidation({
    currentName: form.watch("name"),
    allNames: allExperimentNames,
    form,
    errorMessage: t("validation.experimentNameExists"),
  });
}
