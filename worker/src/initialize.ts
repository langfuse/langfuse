import { upsertDefaultModelPrices } from "./scripts/upsertDefaultModelPrices";
import { upsertManagedEvaluators } from "./scripts/upsertManagedEvaluators";
import { upsertLangfuseDashboards } from "./scripts/upsertLangfuseDashboards";
import { initializeClickhouseCompatibility } from "@langfuse/shared/src/server";

export const initializeWorker = async (): Promise<void> => {
  await initializeClickhouseCompatibility();

  await Promise.all([
    upsertDefaultModelPrices(),
    upsertManagedEvaluators(),
    upsertLangfuseDashboards(),
  ]);
};
