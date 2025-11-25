import { v4 } from "uuid";
import { PrismaClient } from "../../src/index";
import { logger } from "../../src/server";

// Config
const ITEM_COUNT = 50_000;
const BULK_VERSIONS = 5;
const ITEMS_PER_BULK_VERSION = 10_000;
const ADDITIONAL_VERSIONS = 95;
const TOTAL_VERSIONS = 100;

const TEST_DATASET_NAME = "version-perf-test";

interface VersionData {
  timestamp: Date;
  operations: Array<{
    itemId: string;
    operation: "create" | "update" | "delete";
    input?: any;
    expectedOutput?: any;
    metadata?: any;
    deletedAt?: Date | null;
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
          deletedAt: null,
        });
      }

      versions.push({ timestamp, operations });
    }

    logger.info(
      `Created ${BULK_VERSIONS} bulk versions with ${ITEMS_PER_BULK_VERSION} items each`,
    );

    // Create 95 additional versions with mixed operations
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

        if (rand < 0.6) {
          // 60% updates
          operations.push({
            itemId,
            operation: "update" as const,
            input: { prompt: `Updated prompt v${v} for ${itemId}` },
            expectedOutput: {
              response: `Updated response v${v} for ${itemId}`,
            },
            metadata: { version: v + BULK_VERSIONS, updated: true },
            deletedAt: null,
          });
        } else if (rand < 0.9) {
          // 30% creates (new items)
          const newItemId = `item-${BULK_VERSIONS * ITEMS_PER_BULK_VERSION + v * 1000 + i}`;
          existingItemIds.push(newItemId);
          operations.push({
            itemId: newItemId,
            operation: "create" as const,
            input: { prompt: `New prompt v${v} for ${newItemId}` },
            expectedOutput: { response: `New response v${v} for ${newItemId}` },
            metadata: { version: v + BULK_VERSIONS, new: true },
            deletedAt: null,
          });
        } else {
          // 10% deletes
          operations.push({
            itemId,
            operation: "delete" as const,
            input: { prompt: `Deleted prompt for ${itemId}` },
            expectedOutput: { response: `Deleted response for ${itemId}` },
            metadata: { version: v + BULK_VERSIONS, deleted: true },
            deletedAt: timestamp,
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
      const items = version.operations.map((op) => ({
        id: v4(),
        itemId: op.itemId,
        projectId,
        datasetId: dataset.id,
        input: op.input,
        expectedOutput: op.expectedOutput,
        metadata: op.metadata,
        createdAt: version.timestamp,
        deletedAt: op.deletedAt,
        status: "ACTIVE" as const,
      }));

      // Insert in batches using Prisma (cleaner than raw SQL)
      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE);
        await prismaClient.datasetItemEvent.createMany({
          data: batch,
        });
        totalInserts += batch.length;
      }

      if (totalInserts % 10000 === 0) {
        logger.info(`Inserted ${totalInserts} rows...`);
      }
    }

    logger.info(`✅ Complete! Inserted ${totalInserts} total rows`);
    logger.info(`   Dataset: ${TEST_DATASET_NAME}`);
    logger.info(`   Versions: ${TOTAL_VERSIONS}`);
    logger.info(`   Unique items: ~${ITEM_COUNT}`);
  }
}
