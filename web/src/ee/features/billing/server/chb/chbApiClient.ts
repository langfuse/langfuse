/**
 * Web's env-bound handle on the ClickHouse Billing (CHB) REST client.
 *
 * The transport, its schemas, its error types and the fail-closed build rule
 * live in `@langfuse/shared/src/server` so the worker can reach CHB as well —
 * the spend-alert job reads the open period's accrued usage from there. Only
 * the env reading and the process-wide singleton are per-app, because each app
 * validates its own environment.
 */

import { env } from "@/src/env.mjs";
import {
  buildChbApiClient,
  type ChbApiClient,
} from "@langfuse/shared/src/server";

export {
  ChbApiClient,
  ChbPaymentRequiredError,
  type ChbAttachedPlan,
  type ChbCheckoutSession,
} from "@langfuse/shared/src/server";

class ChbApiClientSingleton {
  private static instance: ChbApiClient | null;
  private static built = false;

  public static getInstance(): ChbApiClient | null {
    if (!ChbApiClientSingleton.built) {
      // Cached even when null: an unconfigured deployment must not re-check
      // env on every billing request either.
      ChbApiClientSingleton.instance = buildChbApiClient(env);
      ChbApiClientSingleton.built = true;
    }
    return ChbApiClientSingleton.instance;
  }

  /** Test-only: drop the cached client so the next call rebuilds from env. */
  public static reset(): void {
    ChbApiClientSingleton.built = false;
    ChbApiClientSingleton.instance = null;
  }
}

/**
 * The CHB client for this process, or null when CHB is not fully configured.
 * Callers treat null as "CHB unavailable" and fail closed.
 */
export const getChbApiClient = (): ChbApiClient | null =>
  ChbApiClientSingleton.getInstance();

/** Test-only: reset the singleton between cases. */
export const resetChbApiClientForTests = (): void =>
  ChbApiClientSingleton.reset();
