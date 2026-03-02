import { isOceanBase } from "../../utils/oceanbase";
import { ClickHouseAdapter } from "./adapters/ClickHouseAdapter";
import { OceanBaseAdapter } from "./adapters/OceanBaseAdapter";
import type { IDatabaseAdapter } from "./adapters/IDatabaseAdapter";
import type { NodeClickHouseClientConfigOptions } from "@clickhouse/client/dist/config";
import type { OceanBaseClientConfigOptions } from "../oceanbase/client";

/**
 * Factory class for creating database adapters based on environment configuration
 * Uses OCEANBASE_ENABLED environment variable to determine which adapter to use
 */
export class DatabaseAdapterFactory {
  private static instance: IDatabaseAdapter | null = null;

  /**
   * Get the appropriate database adapter based on environment configuration
   * @param clickhouseConfigs Optional ClickHouse client configuration
   * @param oceanbaseConfig Optional OceanBase client configuration
   * @returns Database adapter instance
   */
  public static getInstance(
    clickhouseConfigs?: NodeClickHouseClientConfigOptions,
    oceanbaseConfig?: OceanBaseClientConfigOptions,
  ): IDatabaseAdapter {
    if (DatabaseAdapterFactory.instance === null) {
      if (isOceanBase()) {
        DatabaseAdapterFactory.instance = new OceanBaseAdapter(oceanbaseConfig);
      } else {
        DatabaseAdapterFactory.instance = new ClickHouseAdapter(
          clickhouseConfigs,
        );
      }
    }

    return DatabaseAdapterFactory.instance;
  }

  /**
   * Reset the singleton instance (useful for testing)
   */
  public static resetInstance(): void {
    DatabaseAdapterFactory.instance = null;
  }

  /**
   * Get the current database system name
   */
  public static getDatabaseSystem(): string {
    const adapter = DatabaseAdapterFactory.getInstance();
    return adapter.getDatabaseSystem();
  }
}
