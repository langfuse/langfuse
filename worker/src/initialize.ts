import { upsertDefaultModelPrices } from "./scripts/upsertDefaultModelPrices";
import { upsertLangfuseDashboards } from "./scripts/upsertLangfuseDashboards";
import {
  initializeClickhouseCompatibility,
  initializeRedisManagedCredentials,
} from "@langfuse/shared/src/server";

export const initializeWorker = async (): Promise<void> => {
  // Must precede app.ts, which registers every queue and worker: ioredis does not
  // retry a rejected AUTH handshake, so a connection opened before the first
  // managed credential arrives is closed for good rather than recovered.
  await initializeRedisManagedCredentials();

  await initializeClickhouseCompatibility();

  await Promise.all([upsertDefaultModelPrices(), upsertLangfuseDashboards()]);
};
