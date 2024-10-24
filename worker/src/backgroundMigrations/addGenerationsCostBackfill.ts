import { IBackgroundMigration } from "./IBackgroundMigration";
import { logger } from "@langfuse/shared/src/server";

export default class AddGenerationsCostBackfill
  implements IBackgroundMigration
{
  async validate(
    args: Record<string, unknown>,
  ): Promise<{ valid: true; invalidReason: string | undefined }> {
    logger.info(
      `Validating AddGenerationsCostBackfill migration with ${JSON.stringify(args)}`,
    );
    return { valid: true, invalidReason: undefined };
  }

  async run(args: Record<string, unknown>): Promise<void> {
    // Run the migration
    logger.info(
      `Running AddGenerationsCostBackfill migration with ${JSON.stringify(args)}`,
    );
  }

  async abort(): Promise<void> {
    // Abort the migration
    logger.info(`Aborting AddGenerationsCostBackfill migration`);
  }
}
