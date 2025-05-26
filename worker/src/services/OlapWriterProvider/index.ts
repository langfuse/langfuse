import { env } from "../../env";
import { ClickhouseWriter } from "../ClickhouseWriter";
import { GreptimeDBWriter } from "../GreptimeDBWriter";
import { logger } from "@langfuse/shared/src/server";

// Define a common interface that both writers should adhere to.
// This will be important for type safety when using the writer instance.
// For now, it's basic, focusing on methods used in IngestionService.
// The TableName type will also need to be unified later.
export interface OlapWriter {
  addToQueue(tableName: any, data: any): void;
  shutdown(): Promise<void>;
  // Add other common methods like flushAll if needed directly by consumers
}

export function getOlapWriter(): OlapWriter {
  const olapBackend = env.LANGFUSE_OLAP_BACKEND?.toLowerCase();

  if (olapBackend === "greptimedb") {
    logger.info("Using GreptimeDB as OLAP backend.");
    return GreptimeDBWriter.getInstance();
  } else {
    if (olapBackend !== "clickhouse" && olapBackend) {
      logger.warn(
        `Unknown LANGFUSE_OLAP_BACKEND value: ${env.LANGFUSE_OLAP_BACKEND}. Defaulting to Clickhouse.`,
      );
    }
    logger.info("Using Clickhouse as OLAP backend.");
    return ClickhouseWriter.getInstance();
  }
}
