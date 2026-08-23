import { upsertDefaultModelPrices } from "./scripts/upsertDefaultModelPrices";
import { upsertManagedEvaluators } from "./scripts/upsertManagedEvaluators";
import { upsertLangfuseDashboards } from "./scripts/upsertLangfuseDashboards";
import {
  initializeClickhouseCompatibility,
  initializeRedisManagedCredentials,
} from "@langfuse/shared/src/server";

export const initializeWorker = async (): Promise<void> => {
  // Must precede app.ts, which registers every queue and worker: a connection
  // opened before the first managed credential arrives cannot authenticate.
  await initializeRedisManagedCredentials();

  await initializeClickhouseCompatibility();

  await Promise.all([
    upsertDefaultModelPrices(),
    upsertManagedEvaluators(),
    upsertLangfuseDashboards(),
  ]);
};
