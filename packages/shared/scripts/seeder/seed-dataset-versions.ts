import { PrismaClient } from "../../src/index";
import { logger } from "../../src/server";

// Config
const ITEM_COUNT = 500;
const BULK_VERSIONS = 5;
const ITEMS_PER_BULK_VERSION = 100;
const ADDITIONAL_VERSIONS = 5;
const TOTAL_VERSIONS = 10;

const TEST_DATASET_NAME = "version-perf-test";

interface VersionData {
  timestamp: Date;
  operations: Array<{
    itemId: string;
    operation: "create" | "update" | "delete";
    status: "ACTIVE" | null;
    input?: any;
    expectedOutput?: any;
    metadata?: any;
    validFrom?: Date;
  }>;
}

export async function seedDatasetVersions(
  prismaClient: PrismaClient,
  projectIds: string[],
) {
  logger.info("Starting dataset version test data generation");

  for (const projectId of projectIds) {
    // Create test dataset
    const dataset = await prismaClient.dataset.upsert({
      where: {
        projectId_name: {
          projectId,
          name: TEST_DATASET_NAME,
        },
      },
      create: {
        name: TEST_DATASET_NAME,
        projectId,
        description: "Performance test dataset for versioning",
      },
      update: {},
    });

    logger.info(`Dataset created/found: ${dataset.id}`);

    // Generate version timeline
    const versions: VersionData[] = [];
    const baseTime = new Date("2024-01-01T00:00:00Z");

    // Create 5 bulk insert versions (10k items each)
    for (let v = 0; v < BULK_VERSIONS; v++) {
      const timestamp = new Date(baseTime.getTime() + v * 60 * 60 * 1000); // 1 hour apart
      const operations = [];

      for (let i = 0; i < ITEMS_PER_BULK_VERSION; i++) {
        const itemId = `item-${v * ITEMS_PER_BULK_VERSION + i}`;
        operations.push({
          itemId,
          operation: "create" as const,
          input: { prompt: `Initial prompt for ${itemId}` },
          expectedOutput: { response: `Initial response for ${itemId}` },
          metadata: { version: v, batch: true },
          status: "ACTIVE" as const,
        });
      }

      versions.push({ timestamp, operations });
    }

    logger.info(
      `Created ${BULK_VERSIONS} bulk versions with ${ITEMS_PER_BULK_VERSION} items each`,
    );

    // Create additional versions with mixed operations
    const existingItemIds = Array.from(
      { length: BULK_VERSIONS * ITEMS_PER_BULK_VERSION },
      (_, i) => `item-${i}`,
    );

    for (let v = 0; v < ADDITIONAL_VERSIONS; v++) {
      const timestamp = new Date(
        baseTime.getTime() + (BULK_VERSIONS + v) * 60 * 60 * 1000,
      );
      const operations = [];
      const operationCount = Math.floor(Math.random() * 100) + 50; // 50-150 operations per version

      for (let i = 0; i < operationCount; i++) {
        const rand = Math.random();
        const itemId =
          existingItemIds[Math.floor(Math.random() * existingItemIds.length)];

        if (rand < 0.7) {
          // 70% updates
          operations.push({
            itemId,
            operation: "update" as const,
            input: { prompt: `Updated prompt v${v} for ${itemId}` },
            expectedOutput: {
              response: `Updated response v${v} for ${itemId}`,
            },
            status: "ACTIVE" as const,
            metadata: { version: v + BULK_VERSIONS, updated: true },
          });
        } else if (rand < 0.85) {
          // 15% deletes
          operations.push({
            itemId,
            operation: "delete" as const,
            input: null,
            expectedOutput: null,
            metadata: null,
            status: null,
            validFrom: timestamp,
          });
        } else {
          // 15% creates (new items)
          const newItemId = `item-${BULK_VERSIONS * ITEMS_PER_BULK_VERSION + v * 100 + i}`;
          existingItemIds.push(newItemId);
          operations.push({
            itemId: newItemId,
            operation: "create" as const,
            input: { prompt: `New prompt v${v} for ${newItemId}` },
            expectedOutput: { response: `New response v${v} for ${newItemId}` },
            status: "ACTIVE" as const,
            metadata: { version: v + BULK_VERSIONS, new: true },
          });
        }
      }
      versions.push({ timestamp, operations });
    }

    logger.info(
      `Created ${ADDITIONAL_VERSIONS} additional versions with mixed operations`,
    );

    // Insert all data
    logger.info("Starting bulk insert...");
    let totalInserts = 0;
    const BATCH_SIZE = 1000;

    for (const version of versions) {
      const items = version.operations.map((op) => {
        const baseRow = {
          id: op.itemId, // The logical item ID (stays same across versions)
          projectId,
          datasetId: dataset.id,
          input: op.input,
          expectedOutput: op.expectedOutput,
          metadata: op.metadata,
          status: op.status,
          sourceTraceId: null,
          sourceObservationId: null,
        };
        if (op.operation === "delete") {
          return {
            ...baseRow,
            validFrom: op.validFrom, // When this version became valid
            isDeleted: true, // Soft delete flag
          };
        } else {
          return {
            ...baseRow,
            validFrom: version.timestamp, // When this version became valid
          };
        }
      });

      // Insert in batches directly into dataset_items (versioned table)
      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE);
        await prismaClient.datasetItem.createMany({
          data: batch,
          skipDuplicates: true, // Skip if already exists (handles re-runs)
        });
        totalInserts += batch.length;
      }

      // After inserting the new version, update valid_to on previous versions
      // This marks old versions as superseded by the new version
      const itemIds = items.map((item) => item.id);
      const validFrom = version.timestamp;

      await prismaClient.$executeRaw`
        UPDATE dataset_items
        SET valid_to = ${validFrom}
        WHERE project_id = ${projectId}
          AND dataset_id = ${dataset.id}
          AND id = ANY(${itemIds}::text[])
          AND valid_from < ${validFrom}
          AND valid_to IS NULL
      `;

      if (totalInserts % 10000 === 0) {
        logger.info(`Inserted ${totalInserts} rows...`);
      }
    }

    logger.info(
      `✅ Complete! Inserted ${totalInserts} total version rows into dataset_items`,
    );
    logger.info(`   Dataset: ${TEST_DATASET_NAME}`);
    logger.info(`   Versions: ${TOTAL_VERSIONS}`);
    logger.info(`   Unique items: ~${ITEM_COUNT}`);
  }
}
