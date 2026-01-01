/**
 * This script is used to patch the LLMTool and LLMSchemaAuditLogs in the database.
 * Initially, the routers were created with a wrong resource type "project" within their audit logs,
 * instead of using llmTool and llmSchema respectively.
 * This caused inconsistent audit logs with false-positive changes on projects.
 *
 * With this migration, we'll read all audit log records for projects where there is a mismatch
 * between project_id and resource_id and try to infer the correct resource type from the before or after columns.
 */

import { IBackgroundMigration } from "./IBackgroundMigration";
import { logger } from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";

// This is hard-coded in our migrations and uniquely identifies the row in background_migrations table
const backgroundMigrationId = "3445cac4-d9d5-4750-8b65-351135c1b85e"; // eslint-disable-line no-unused-vars

export default class PatchLLMToolAndLLMSchemaAuditLogs
  implements IBackgroundMigration
{
  private isAborted = false;
  private isFinished = false;

  async validate(): Promise<{
    valid: boolean;
    invalidReason: string | undefined;
  }> {
    return { valid: true, invalidReason: undefined };
  }

  async run(): Promise<void> {
    const start = Date.now();
    logger.info(
      `[Background Migration] Patching audit logs for LLMTool and LLMSchema`,
    );

    const failedInferenceIds = new Set<String>();

    const batchSize = 1000;
    let processedRows = 0;
    while (!this.isAborted && !this.isFinished) {
      // Fetch a batch of audit logs that need to be patched
      const auditLogs = (
        await prisma.auditLog.findMany({
          where: {
            resourceType: "project",
            resourceId: {
              not: {
                equals: prisma.auditLog.fields.projectId,
              },
            },
          },
          take: batchSize,
        })
      ).filter((a) => !failedInferenceIds.has(a.id));

      // Try to infer whether the resource is an LLMTool or LLMToolSchema
      for (const auditLog of auditLogs) {
        try {
          const before = auditLog.before ? JSON.parse(auditLog.before) : {};
          if ("schema" in before) {
            auditLog.resourceType = "llmSchema";
          }
          if ("parameters" in before) {
            auditLog.resourceType = "llmTool";
          }
        } catch (error) {
          logger.warn(
            `[Background Migration] Failed to parse 'before' field for audit log ${auditLog.id}: ${error}`,
          );
        }

        try {
          const after = auditLog.after ? JSON.parse(auditLog.after) : {};
          if ("schema" in after) {
            auditLog.resourceType = "llmSchema";
          }
          if ("parameters" in after) {
            auditLog.resourceType = "llmTool";
          }
        } catch (error) {
          logger.warn(
            `[Background Migration] Failed to parse 'after' field for audit log ${auditLog.id}: ${error}`,
          );
        }
        // If the resourceType is still "project", we cannot infer it
        if (auditLog.resourceType === "project") {
          failedInferenceIds.add(auditLog.id);
        }
      }

      // Update the audit logs in the database
      await Promise.all(
        auditLogs.map((auditLog) =>
          prisma.auditLog.update({
            where: { id: auditLog.id },
            data: {
              resourceType: auditLog.resourceType,
            },
          }),
        ),
      );

      processedRows += auditLogs.length;

      if (auditLogs.length === 0) {
        this.isFinished = true;
      }

      if (this.isAborted) {
        logger.info(
          `[Background Migration] Patching of audit logs for LLMTool and LLMSchema aborted after processing ${processedRows} rows. Skipping cleanup.`,
        );
        return;
      }
    }
    logger.info(
      `[Background Migration] Finished patching of audit logs for LLMTool and LLMSchema in ${Date.now() - start}ms - Rows: ${processedRows}`,
    );
  }

  async abort(): Promise<void> {
    logger.info(
      `[Background Migration] Aborting patching of LLMTool and LLMSchema audit logs`,
    );
    this.isAborted = true;
  }
}

async function main() {
  const migration = new PatchLLMToolAndLLMSchemaAuditLogs();
  await migration.validate();
  await migration.run();
}

// If the script is being executed directly (not imported), run the main function
if (require.main === module) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      logger.error(`Migration execution failed: ${error}`, error);
      process.exit(1); // Exit with an error code
    });
}
