import {
  buildChbApiClient,
  type ChbApiClient,
} from "@langfuse/shared/src/server";

import { env } from "../../env";

/**
 * The worker's env-bound handle on the ClickHouse Billing REST client — the
 * twin of `web/src/ee/features/billing/server/chb/chbApiClient.ts`. Shared
 * owns the transport and the fail-closed build rule; the singleton is per-app
 * so one Auth0 token is minted per process rather than per job.
 */
class ChbApiClientSingleton {
  private static instance: ChbApiClient | null;
  private static built = false;

  public static getInstance(): ChbApiClient | null {
    if (!ChbApiClientSingleton.built) {
      // Cached even when null: an unconfigured deployment must not re-check
      // env on every job either.
      ChbApiClientSingleton.instance = buildChbApiClient(env);
      ChbApiClientSingleton.built = true;
    }
    return ChbApiClientSingleton.instance;
  }
}

/** The CHB client for this process, or null when CHB is not fully configured. */
export const getChbApiClient = (): ChbApiClient | null =>
  ChbApiClientSingleton.getInstance();

/** Whether this deployment can reach CHB at all. */
export const isChbConfigured = (): boolean => getChbApiClient() !== null;
