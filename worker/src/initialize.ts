import { upsertDefaultModelPrices } from "./scripts/upsertDefaultModelPrices";
import { upsertManagedEvaluators } from "./scripts/upsertManagedEvaluators";
import { upsertLangfuseDashboards } from "./scripts/upsertLangfuseDashboards";
import {
  initializeClickhouseCompatibility,
  initializeClickhouseShardingContract,
} from "@langfuse/shared/src/server";

export const initializeWorker = async (): Promise<void> => {
  await initializeClickhouseCompatibility();
  await initializeClickhouseShardingContract();

  await Promise.all([
    upsertDefaultModelPrices(),
    upsertManagedEvaluators(),
    upsertLangfuseDashboards(),
  ]);
};
