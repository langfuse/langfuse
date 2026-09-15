import { upsertDefaultModelPrices } from "./scripts/upsertDefaultModelPrices";
import { upsertLangfuseDashboards } from "./scripts/upsertLangfuseDashboards";
import { hello, initTelemetry } from "@langfuse/native";
import {
  initializeClickhouseCompatibility,
  logger,
  recordIncrement,
} from "@langfuse/shared/src/server";

export const initializeWorker = async (): Promise<void> => {
  initializeNativeAddon();

  await initializeClickhouseCompatibility();

  await Promise.all([upsertDefaultModelPrices(), upsertLangfuseDashboards()]);
};

// Two separate success signals. The addon must load and run, or the build is
// broken: hello() is deliberately unguarded and stops the worker. Whether the
// addon's own telemetry could be set up is an operational concern that must
// not keep the worker from processing jobs, so that failure is reported
// through the Node side's logger and metrics instead (the addon records its
// own metrics and logs once initialised; see packages/native/README.md).
const initializeNativeAddon = (): void => {
  try {
    initTelemetry();
  } catch (error) {
    logger.error("Native telemetry initialisation failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    recordIncrement("langfuse.native.telemetry_init_failed");
  }
  hello("startup");
};
