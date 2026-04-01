/** @jest-environment node */
// Set environment variables before any imports to ensure VERSIONED mode
process.env.LANGFUSE_DATASET_SERVICE_READ_FROM_VERSIONED_IMPLEMENTATION =
  "true";
process.env.LANGFUSE_DATASET_SERVICE_WRITE_TO_VERSIONED_IMPLEMENTATION = "true";

import { prisma } from "@langfuse/shared/src/db";
import {
  createDatasetItem,
  upsertDatasetItem,
  deleteDatasetItem,
  createManyDatasetItems,
  getDatasetItemById,
  createDatasetItemFilterState,
  listDatasetVersions,
  getDatasetItemVersionHistory,
  getDatasetItemChangesSinceVersion,
  getDatasetItems,
} from "@langfuse/shared/src/server";
import { v4 } from "uuid";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

// Helper to add small delays for distinct timestamps
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("Dataset Items Repository - Versioning Tests", () => {
  describe("listDatasetVersions()", () => {
    it("should return empty array for new dataset", async () => {
      const datasetId = v4();
      await prisma.dataset.create({
        data: { id: datasetId, name: v4(), projectId },
      });

      const versions = await listDatasetVersions({ projectId, datasetId });
      expect(versions).toEqual([]);
    });

    it("should return version timestamps after creating items", async () => {
      const datasetId = v4();
      await prisma.dataset.create({
        data: { id: datasetId, name: v4(), projectId },
      });

      await createDatasetItem({
        projectId,
        datasetId,
        input: { key: "value1" },
        normalizeOpts: {},
        validateOpts: {},
      });

      await delay(10);

      await createDatasetItem({
        projectId,
        datasetId,
        input: { key: "value2" },
        normalizeOpts: {},
        validateOpts: {},
      });

      const versions = await listDatasetVersions({ projectId, datasetId });
      expect(versions.length).toBe(2);
      expect(versions[0].getTime()).toBeGreaterThan(versions[1].getTime());
    });

    it("should return versions in descending order", async () => {
      const datasetId = v4();
      await prisma.dataset.create({
        data: { id: datasetId, name: v4(), projectId },
      });

      for (let i = 0; i < 3; i++) {
        await createDatasetItem({
          projectId,
          datasetId,
          input: { iteration: i },
          normalizeOpts: {},
          validateOpts: {},
        });
        await delay(10);
      }

      const versions = await listDatasetVersions({ projectId, datasetId });
      expect(versions.length).toBe(3);

      for (let i = 0; i < versions.length - 1; i++) {
        expect(versions[i].getTime()).toBeGreaterThan(
          versions[i + 1].getTime(),
        );
      }
    });
  });

  describe("getDatasetItemVersionHistory()", () => {
    it("should return empty array for non-existent item", async () => {
      const datasetId = v4();
      await prisma.dataset.create({
        data: { id: datasetId, name: v4(), projectId },
      });

      const history = await getDatasetItemVersionHistory({
        projectId,
        datasetId,
        itemId: "non-existent",
      });
      expect(history).toEqual([]);
    });

    it("should return single version for newly created item", async () => {
      const datasetId = v4();
      await prisma.dataset.create({
        data: { id: datasetId, name: v4(), projectId },
      });

      const result = await createDatasetItem({
        projectId,
        datasetId,
        input: { key: "value" },
        normalizeOpts: {},
        validateOpts: {},
      });

      if (!result.success) throw new Error("Failed to create item");

      const history = await getDatasetItemVersionHistory({
        projectId,
        datasetId,
        itemId: result.datasetItem.id,
      });

      expect(history.length).toBe(1);
      expect(history[0]).toBeInstanceOf(Date);
    });

    it("should return multiple versions after updates", async () => {
      const datasetId = v4();
      const itemId = v4();
      await prisma.dataset.create({
        data: { id: datasetId, name: v4(), projectId },
      });

      await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId,
        input: { version: 1 },
        normalizeOpts: {},
        validateOpts: {},
      });

      await delay(10);

      await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId,
        input: { version: 2 },
        normalizeOpts: {},
        validateOpts: {},
      });

      await delay(10);

      await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId,
        input: { version: 3 },
        normalizeOpts: {},
        validateOpts: {},
      });

      const history = await getDatasetItemVersionHistory({
        projectId,
        datasetId,
        itemId,
      });

      expect(history.length).toBe(3);
      expect(history[0].getTime()).toBeGreaterThan(history[1].getTime());
      expect(history[1].getTime()).toBeGreaterThan(history[2].getTime());
    });

    it("should include version when item is deleted", async () => {
      const datasetId = v4();
      const itemId = v4();
      await prisma.dataset.create({
        data: { id: datasetId, name: v4(), projectId },
      });

      await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId,
        input: { key: "value" },
        normalizeOpts: {},
        validateOpts: {},
      });

      await delay(10);

      await deleteDatasetItem({
        projectId,
        datasetItemId: itemId,
        datasetId,
      });

      const history = await getDatasetItemVersionHistory({
        projectId,
        datasetId,
        itemId,
      });

      expect(history.length).toBe(2);
    });
  });

  describe("getDatasetItemChangesSinceVersion()", () => {
    it("should return zero counts for latest version", async () => {
      const datasetId = v4();
      await prisma.dataset.create({
        data: { id: datasetId, name: v4(), projectId },
      });

      await createDatasetItem({
        projectId,
        datasetId,
        input: { key: "value" },
        normalizeOpts: {},
        validateOpts: {},
      });

      const now = new Date();
      const changes = await getDatasetItemChangesSinceVersion({
        projectId,
        datasetId,
        sinceVersion: now,
      });

      expect(changes).toEqual({ upserts: 0, deletes: 0 });
    });

    it("should count upserts correctly after creating items", async () => {
      const datasetId = v4();
      await prisma.dataset.create({
        data: { id: datasetId, name: v4(), projectId },
      });

      const versionTimestamp = new Date();
      await delay(10);

      await createDatasetItem({
        projectId,
        datasetId,
        input: { key: "value1" },
        normalizeOpts: {},
        validateOpts: {},
      });

      await delay(10);

      await createDatasetItem({
        projectId,
        datasetId,
        input: { key: "value2" },
        normalizeOpts: {},
        validateOpts: {},
      });

      const changes = await getDatasetItemChangesSinceVersion({
        projectId,
        datasetId,
        sinceVersion: versionTimestamp,
      });

      expect(changes.upserts).toBe(2);
      expect(changes.deletes).toBe(0);
    });

    it("should count deletes correctly after deleting items", async () => {
      const datasetId = v4();
      const itemId1 = v4();
      const itemId2 = v4();
      await prisma.dataset.create({
        data: { id: datasetId, name: v4(), projectId },
      });

      await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId1,
        input: { key: "value1" },
        normalizeOpts: {},
        validateOpts: {},
      });

      await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId2,
        input: { key: "value2" },
        normalizeOpts: {},
        validateOpts: {},
      });

      await delay(10);
      const versionTimestamp = new Date();
      await delay(10);

      await deleteDatasetItem({
        projectId,
        datasetItemId: itemId1,
        datasetId,
      });

      await delay(10);

      await deleteDatasetItem({
        projectId,
        datasetItemId: itemId2,
        datasetId,
      });

      const changes = await getDatasetItemChangesSinceVersion({
        projectId,
        datasetId,
        sinceVersion: versionTimestamp,
      });

      expect(changes.upserts).toBe(0);
      expect(changes.deletes).toBe(2);
    });

    it("should count both upserts and deletes in mixed scenarios", async () => {
      const datasetId = v4();
      const itemId1 = v4();
      await prisma.dataset.create({
        data: { id: datasetId, name: v4(), projectId },
      });

      await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId1,
        input: { key: "value1" },
        normalizeOpts: {},
        validateOpts: {},
      });

      await delay(10);
      const versionTimestamp = new Date();
      await delay(10);

      // Update existing item (upsert)
      await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId1,
        input: { key: "updated" },
        normalizeOpts: {},
        validateOpts: {},
      });

      await delay(10);

      // Create new item
      await createDatasetItem({
        projectId,
        datasetId,
        input: { key: "value2" },
        normalizeOpts: {},
        validateOpts: {},
      });

      await delay(10);

      // Delete the first item
      await deleteDatasetItem({
        projectId,
        datasetItemId: itemId1,
        datasetId,
      });

      const changes = await getDatasetItemChangesSinceVersion({
        projectId,
        datasetId,
        sinceVersion: versionTimestamp,
      });

      expect(changes.upserts).toBe(2); // 1 update + 1 create
      expect(changes.deletes).toBe(1);
    });
  });

  describe("getDatasetItemById() with version parameter", () => {
    it("should return latest item when no version specified", async () => {
      const datasetId = v4();
      const itemId = v4();
      await prisma.dataset.create({
        data: { id: datasetId, name: v4(), projectId },
      });

      await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId,
        input: { version: "initial" },
        normalizeOpts: {},
        validateOpts: {},
      });

      await delay(10);

      await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId,
        input: { version: "updated" },
        normalizeOpts: {},
        validateOpts: {},
      });

      const item = await getDatasetItemById({
        projectId,
        datasetItemId: itemId,
      });

      expect(item).not.toBeNull();
      expect(item?.input).toEqual({ version: "updated" });
    });

    it("should return item at specific version timestamp", async () => {
      const datasetId = v4();
      const itemId = v4();
      await prisma.dataset.create({
        data: { id: datasetId, name: v4(), projectId },
      });

      await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId,
        input: { version: "v1" },
        normalizeOpts: {},
        validateOpts: {},
      });

      await delay(10);
      const midpointTimestamp = new Date();
      await delay(10);

      await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId,
        input: { version: "v2" },
        normalizeOpts: {},
        validateOpts: {},
      });

      const item = await getDatasetItemById({
        projectId,
        datasetItemId: itemId,
        version: midpointTimestamp,
      });

      expect(item).not.toBeNull();
      expect(item?.input).toEqual({ version: "v1" });
    });

    it("should return null when item doesn't exist at version (created after)", async () => {
      const datasetId = v4();
      const itemId = v4();
      await prisma.dataset.create({
        data: { id: datasetId, name: v4(), projectId },
      });

      const beforeCreation = new Date();
      await delay(10);

      await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId,
        input: { key: "value" },
        normalizeOpts: {},
        validateOpts: {},
      });

      const item = await getDatasetItemById({
        projectId,
        datasetItemId: itemId,
        version: beforeCreation,
      });

      expect(item).toBeNull();
    });

    it("should return null when item was deleted before version", async () => {
      const datasetId = v4();
      const itemId = v4();
      await prisma.dataset.create({
        data: { id: datasetId, name: v4(), projectId },
      });

      await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId,
        input: { key: "value" },
        normalizeOpts: {},
        validateOpts: {},
      });

      await delay(10);

      await deleteDatasetItem({
        projectId,
        datasetItemId: itemId,
        datasetId,
      });

      await delay(10);
      const afterDeletion = new Date();

      const item = await getDatasetItemById({
        projectId,
        datasetItemId: itemId,
        version: afterDeletion,
      });

      expect(item).toBeNull();
    });

    it("should handle version before any item exists", async () => {
      const datasetId = v4();
      await prisma.dataset.create({
        data: { id: datasetId, name: v4(), projectId },
      });

      const veryOldTimestamp = new Date("2020-01-01");

      const item = await getDatasetItemById({
        projectId,
        datasetItemId: "any-id",
        version: veryOldTimestamp,
      });

      expect(item).toBeNull();
    });
  });

  describe("getDatasetItems() with version parameter", () => {
    it("should return current items when no version specified", async () => {
      const datasetId = v4();
      await prisma.dataset.create({
        data: { id: datasetId, name: v4(), projectId },
      });

      await createDatasetItem({
        projectId,
        datasetId,
        input: { item: 1 },
      });

      await createDatasetItem({
        projectId,
        datasetId,
        input: { item: 2 },
      });

      const items = await getDatasetItems({
        projectId,
        filterState: createDatasetItemFilterState({ datasetIds: [datasetId] }),
      });

      expect(items.length).toBe(2);
    });

    it("should return items as they existed at version timestamp", async () => {
      const datasetId = v4();
      const itemId = v4();
      await prisma.dataset.create({
        data: { id: datasetId, name: v4(), projectId },
      });

      await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId,
        input: { state: "initial" },
        normalizeOpts: {},
        validateOpts: {},
      });

      await delay(10);
      const midpointTimestamp = new Date();
      await delay(10);

      await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId,
        input: { state: "updated" },
        normalizeOpts: {},
        validateOpts: {},
      });

      const items = await getDatasetItems({
        projectId,
        filterState: createDatasetItemFilterState({ datasetIds: [datasetId] }),
        version: midpointTimestamp,
      });

      expect(items.length).toBe(1);
      expect(items[0].input).toEqual({ state: "initial" });
    });

    it("should exclude items created after version", async () => {
      const datasetId = v4();
      await prisma.dataset.create({
        data: { id: datasetId, name: v4(), projectId },
      });

      await createDatasetItem({
        projectId,
        datasetId,
        input: { item: "before" },
        normalizeOpts: {},
        validateOpts: {},
      });

      await delay(10);
      const versionTimestamp = new Date();
      await delay(10);

      await createDatasetItem({
        projectId,
        datasetId,
        input: { item: "after" },
        normalizeOpts: {},
        validateOpts: {},
      });

      const items = await getDatasetItems({
        projectId,
        filterState: createDatasetItemFilterState({ datasetIds: [datasetId] }),
        version: versionTimestamp,
      });

      expect(items.length).toBe(1);
      expect(items[0].input).toEqual({ item: "before" });
    });

    it("should exclude deleted items at version", async () => {
      const datasetId = v4();
      const itemId1 = v4();
      const itemId2 = v4();
      await prisma.dataset.create({
        data: { id: datasetId, name: v4(), projectId },
      });

      await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId1,
        input: { item: 1 },
        normalizeOpts: {},
        validateOpts: {},
      });

      await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId2,
        input: { item: 2 },
        normalizeOpts: {},
        validateOpts: {},
      });

      await delay(10);

      await deleteDatasetItem({
        projectId,
        datasetItemId: itemId1,
        datasetId,
      });

      await delay(10);
      const afterDeleteTimestamp = new Date();

      const items = await getDatasetItems({
        projectId,
        filterState: createDatasetItemFilterState({ datasetIds: [datasetId] }),
        version: afterDeleteTimestamp,
      });

      expect(items.length).toBe(1);
      expect(items[0].input).toEqual({ item: 2 });
    });

    it("should handle multiple items with mixed version states", async () => {
      const datasetId = v4();
      const itemId1 = v4();
      const itemId2 = v4();
      const itemId3 = v4();
      await prisma.dataset.create({
        data: { id: datasetId, name: v4(), projectId },
      });

      // Item 1: exists before version
      await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId1,
        input: { item: 1 },
        normalizeOpts: {},
        validateOpts: {},
      });

      await delay(10);
      const versionTimestamp = new Date();
      await delay(10);

      // Item 2: created after version
      await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId2,
        input: { item: 2 },
        normalizeOpts: {},
        validateOpts: {},
      });

      // Item 3: created before but deleted after
      await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId3,
        input: { item: 3 },
        normalizeOpts: {},
        validateOpts: {},
      });

      await delay(10);
      await deleteDatasetItem({
        projectId,
        datasetItemId: itemId3,
        datasetId,
      });

      const items = await getDatasetItems({
        projectId,
        filterState: createDatasetItemFilterState({ datasetIds: [datasetId] }),
        version: versionTimestamp,
      });

      expect(items.length).toBe(1);
      expect(items[0].id).toBe(itemId1);
    });
  });

  describe("createDatasetItem()", () => {
    it("should create item with initial version timestamp", async () => {
      const datasetId = v4();
      await prisma.dataset.create({
        data: { id: datasetId, name: v4(), projectId },
      });

      const beforeCreate = new Date();
      await delay(5);

      const result = await createDatasetItem({
        projectId,
        datasetId,
        input: { key: "value" },
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      const item = await getDatasetItemById({
        projectId,
        datasetItemId: result.datasetItem.id,
      });

      expect(item).not.toBeNull();
      expect(item?.validFrom.getTime()).toBeGreaterThan(beforeCreate.getTime());
    });

    it("should allow creating multiple items with different timestamps", async () => {
      const datasetId = v4();
      await prisma.dataset.create({
        data: { id: datasetId, name: v4(), projectId },
      });

      const result1 = await createDatasetItem({
        projectId,
        datasetId,
        input: { order: 1 },
      });

      await delay(10);

      const result2 = await createDatasetItem({
        projectId,
        datasetId,
        input: { order: 2 },
      });

      expect(result1.success && result2.success).toBe(true);
      if (!result1.success || !result2.success) return;

      const item1 = await getDatasetItemById({
        projectId,
        datasetItemId: result1.datasetItem.id,
      });

      const item2 = await getDatasetItemById({
        projectId,
        datasetItemId: result2.datasetItem.id,
      });

      expect(item1?.validFrom.getTime()).toBeLessThan(
        item2?.validFrom.getTime() ?? 0,
      );
    });
  });

  describe("upsertDatasetItem()", () => {
    it("should create new item with version when ID doesn't exist", async () => {
      const datasetId = v4();
      const itemId = v4();
      await prisma.dataset.create({
        data: { id: datasetId, name: v4(), projectId },
      });

      const item = await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId,
        input: { key: "value" },
        normalizeOpts: {},
        validateOpts: {},
      });

      expect(item.id).toBe(itemId);
      expect(item.input).toEqual({ key: "value" });
    });

    it("should create new version on update with same ID", async () => {
      const datasetId = v4();
      const itemId = v4();
      await prisma.dataset.create({
        data: { id: datasetId, name: v4(), projectId },
      });

      await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId,
        input: { version: 1 },
        normalizeOpts: {},
        validateOpts: {},
      });

      await delay(10);

      await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId,
        input: { version: 2 },
        normalizeOpts: {},
        validateOpts: {},
      });

      const history = await getDatasetItemVersionHistory({
        projectId,
        datasetId,
        itemId,
      });

      expect(history.length).toBe(2);
    });

    it("should preserve old versions after update", async () => {
      const datasetId = v4();
      const itemId = v4();
      await prisma.dataset.create({
        data: { id: datasetId, name: v4(), projectId },
      });

      await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId,
        input: { state: "v1" },
        normalizeOpts: {},
        validateOpts: {},
      });

      await delay(10);
      const v1Timestamp = new Date();
      await delay(10);

      await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId,
        input: { state: "v2" },
        normalizeOpts: {},
        validateOpts: {},
      });

      const oldVersion = await getDatasetItemById({
        projectId,
        datasetItemId: itemId,
        version: v1Timestamp,
      });

      const newVersion = await getDatasetItemById({
        projectId,
        datasetItemId: itemId,
      });

      expect(oldVersion?.input).toEqual({ state: "v1" });
      expect(newVersion?.input).toEqual({ state: "v2" });
    });

    it("should return merged data correctly", async () => {
      const datasetId = v4();
      const itemId = v4();
      await prisma.dataset.create({
        data: { id: datasetId, name: v4(), projectId },
      });

      await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId,
        input: { key1: "value1" },
        expectedOutput: { result: "output1" },
        normalizeOpts: {},
        validateOpts: {},
      });

      await delay(10);

      const updated = await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId,
        input: { key2: "value2" },
        normalizeOpts: {},
        validateOpts: {},
      });

      // Input should be replaced (not merged)
      expect(updated.input).toEqual({ key2: "value2" });
      // ExpectedOutput should be preserved
      expect(updated.expectedOutput).toEqual({ result: "output1" });
    });
  });

  describe("deleteDatasetItem()", () => {
    it("should create delete marker in VERSIONED mode", async () => {
      const datasetId = v4();
      const itemId = v4();
      await prisma.dataset.create({
        data: { id: datasetId, name: v4(), projectId },
      });

      await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId,
        input: { key: "value" },
        normalizeOpts: {},
        validateOpts: {},
      });

      await delay(10);

      await deleteDatasetItem({
        projectId,
        datasetItemId: itemId,
        datasetId,
      });

      const item = await getDatasetItemById({
        projectId,
        datasetItemId: itemId,
      });

      expect(item).toBeNull();
    });

    it("should preserve item history after delete", async () => {
      const datasetId = v4();
      const itemId = v4();
      await prisma.dataset.create({
        data: { id: datasetId, name: v4(), projectId },
      });

      await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId,
        input: { key: "value" },
        normalizeOpts: {},
        validateOpts: {},
      });

      await delay(10);
      const beforeDelete = new Date();
      await delay(10);

      await deleteDatasetItem({
        projectId,
        datasetItemId: itemId,
        datasetId,
      });

      const itemAtOldVersion = await getDatasetItemById({
        projectId,
        datasetItemId: itemId,
        version: beforeDelete,
      });

      expect(itemAtOldVersion).not.toBeNull();
      expect(itemAtOldVersion?.input).toEqual({ key: "value" });
    });

    it("should make item inaccessible at later versions", async () => {
      const datasetId = v4();
      const itemId = v4();
      await prisma.dataset.create({
        data: { id: datasetId, name: v4(), projectId },
      });

      await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId,
        input: { key: "value" },
        normalizeOpts: {},
        validateOpts: {},
      });

      await delay(10);

      await deleteDatasetItem({
        projectId,
        datasetItemId: itemId,
        datasetId,
      });

      await delay(10);
      const afterDelete = new Date();

      const item = await getDatasetItemById({
        projectId,
        datasetItemId: itemId,
        version: afterDelete,
      });

      expect(item).toBeNull();
    });

    it("should still return item at versions before delete", async () => {
      const datasetId = v4();
      const itemId = v4();
      await prisma.dataset.create({
        data: { id: datasetId, name: v4(), projectId },
      });

      await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId,
        input: { key: "value" },
        normalizeOpts: {},
        validateOpts: {},
      });

      await delay(10);
      const beforeDelete = new Date();
      await delay(10);

      await deleteDatasetItem({
        projectId,
        datasetItemId: itemId,
        datasetId,
      });

      const beforeItem = await getDatasetItemById({
        projectId,
        datasetItemId: itemId,
        version: beforeDelete,
      });

      const afterItem = await getDatasetItemById({
        projectId,
        datasetItemId: itemId,
      });

      expect(beforeItem).not.toBeNull();
      expect(afterItem).toBeNull();
    });
  });

  describe("createManyDatasetItems()", () => {
    it("should create multiple items with same version timestamp", async () => {
      const datasetId = v4();
      await prisma.dataset.create({
        data: { id: datasetId, name: v4(), projectId },
      });

      const beforeCreate = new Date();
      await delay(5);

      const result = await createManyDatasetItems({
        projectId,
        items: [
          { datasetId, input: { item: 1 } },
          { datasetId, input: { item: 2 } },
          { datasetId, input: { item: 3 } },
        ],
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      const versions = await listDatasetVersions({ projectId, datasetId });
      expect(versions.length).toBe(1);
      expect(versions[0].getTime()).toBeGreaterThan(beforeCreate.getTime());
    });

    it("should create distinct items each time with unique IDs", async () => {
      const datasetId = v4();
      await prisma.dataset.create({
        data: { id: datasetId, name: v4(), projectId },
      });

      const result1 = await createManyDatasetItems({
        projectId,
        items: [
          { datasetId, input: { batch: 1, item: 1 } },
          { datasetId, input: { batch: 1, item: 2 } },
        ],
      });

      await delay(10);

      const result2 = await createManyDatasetItems({
        projectId,
        items: [
          { datasetId, input: { batch: 2, item: 1 } },
          { datasetId, input: { batch: 2, item: 2 } },
        ],
      });

      expect(result1.success && result2.success).toBe(true);
      if (!result1.success || !result2.success) return;

      // All items should have unique IDs
      const allIds = [
        ...result1.datasetItems.map((i) => i.id),
        ...result2.datasetItems.map((i) => i.id),
      ];
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(4);

      // Should have 2 version timestamps (one per batch)
      const versions = await listDatasetVersions({ projectId, datasetId });
      expect(versions.length).toBe(2);
    });
  });

  describe("Status filter tests (filtering on latest version)", () => {
    it("should filter by ACTIVE status on latest version, not historical versions", async () => {
      const datasetId = v4();
      const itemId = v4();
      await prisma.dataset.create({
        data: { id: datasetId, name: v4(), projectId },
      });

      // Create item with ACTIVE status
      await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId,
        input: { key: "value" },
        status: "ACTIVE",
        normalizeOpts: {},
        validateOpts: {},
      });

      await delay(10);

      // Update to ARCHIVED status
      await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId,
        input: { key: "updated" },
        status: "ARCHIVED",
        normalizeOpts: {},
        validateOpts: {},
      });

      // Filter by ACTIVE - should return 0 items (latest version is ARCHIVED)
      const activeItems = await getDatasetItems({
        projectId,
        filterState: createDatasetItemFilterState({
          datasetIds: [datasetId],
          status: "ACTIVE",
        }),
      });

      expect(activeItems.length).toBe(0);
    });

    it("should count only items with ACTIVE status in latest version", async () => {
      const datasetId = v4();
      const itemId1 = v4();
      const itemId2 = v4();
      const itemId3 = v4();
      await prisma.dataset.create({
        data: { id: datasetId, name: v4(), projectId },
      });

      // Item 1: ACTIVE initially, then ARCHIVED
      await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId1,
        input: { item: 1 },
        status: "ACTIVE",
        normalizeOpts: {},
        validateOpts: {},
      });
      await delay(10);
      await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId1,
        input: { item: 1 },
        status: "ARCHIVED",
        normalizeOpts: {},
        validateOpts: {},
      });

      // Item 2: ACTIVE and stays ACTIVE
      await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId2,
        input: { item: 2 },
        status: "ACTIVE",
        normalizeOpts: {},
        validateOpts: {},
      });

      // Item 3: ARCHIVED initially, then ACTIVE
      await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId3,
        input: { item: 3 },
        status: "ARCHIVED",
        normalizeOpts: {},
        validateOpts: {},
      });
      await delay(10);
      await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId3,
        input: { item: 3 },
        status: "ACTIVE",
        normalizeOpts: {},
        validateOpts: {},
      });

      // Get ACTIVE items - should be 2 (item2, item3)
      const activeItems = await getDatasetItems({
        projectId,
        filterState: createDatasetItemFilterState({
          datasetIds: [datasetId],
          status: "ACTIVE",
        }),
      });

      expect(activeItems.length).toBe(2);
      expect(activeItems.map((i) => i.id).sort()).toEqual(
        [itemId2, itemId3].sort(),
      );
    });

    it("should apply all filters (status, sourceTraceId, etc.) to latest version only", async () => {
      const datasetId = v4();
      const itemId = v4();
      const traceId1 = v4();
      const traceId2 = v4();
      await prisma.dataset.create({
        data: { id: datasetId, name: v4(), projectId },
      });

      // Version 1: ACTIVE with traceId1
      await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId,
        input: { version: 1 },
        status: "ACTIVE",
        sourceTraceId: traceId1,
        normalizeOpts: {},
        validateOpts: {},
      });

      await delay(10);

      // Version 2: ARCHIVED with traceId2 (latest)
      await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId,
        input: { version: 2 },
        status: "ARCHIVED",
        sourceTraceId: traceId2,
        normalizeOpts: {},
        validateOpts: {},
      });

      // Filter by ACTIVE + traceId1 - should return 0 (latest is ARCHIVED with traceId2)
      const items = await getDatasetItems({
        projectId,
        filterState: createDatasetItemFilterState({
          datasetIds: [datasetId],
          status: "ACTIVE",
          sourceTraceId: traceId1,
        }),
      });

      expect(items.length).toBe(0);

      // Filter by ARCHIVED + traceId2 - should return 1 (matches latest)
      const archivedItems = await getDatasetItems({
        projectId,
        filterState: [
          {
            type: "stringOptions",
            column: "datasetId",
            operator: "any of",
            value: [datasetId],
          },
          {
            type: "stringOptions",
            column: "status",
            operator: "any of",
            value: ["ARCHIVED"],
          },
          {
            type: "string",
            column: "sourceTraceId",
            operator: "=",
            value: traceId2,
          },
        ],
      });

      expect(archivedItems.length).toBe(1);
      expect(archivedItems[0].sourceTraceId).toBe(traceId2);
      expect(archivedItems[0].status).toBe("ARCHIVED");
    });
  });

  describe("Time-travel integration tests", () => {
    it("should support complete lifecycle: create → update → delete with time-travel", async () => {
      const datasetId = v4();
      const itemId = v4();
      await prisma.dataset.create({
        data: { id: datasetId, name: v4(), projectId },
      });

      // Phase 1: Create
      await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId,
        input: { phase: "created" },
        normalizeOpts: {},
        validateOpts: {},
      });

      await delay(10);
      const afterCreate = new Date();
      await delay(10);

      // Phase 2: Update
      await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId,
        input: { phase: "updated" },
        normalizeOpts: {},
        validateOpts: {},
      });

      await delay(10);
      const afterUpdate = new Date();
      await delay(10);

      // Phase 3: Delete
      await deleteDatasetItem({
        projectId,
        datasetItemId: itemId,
        datasetId,
      });

      await delay(10);
      const afterDelete = new Date();

      // Verify item at each point in time
      const atCreate = await getDatasetItemById({
        projectId,
        datasetItemId: itemId,
        version: afterCreate,
      });
      expect(atCreate?.input).toEqual({ phase: "created" });

      const atUpdate = await getDatasetItemById({
        projectId,
        datasetItemId: itemId,
        version: afterUpdate,
      });
      expect(atUpdate?.input).toEqual({ phase: "updated" });

      const atDelete = await getDatasetItemById({
        projectId,
        datasetItemId: itemId,
        version: afterDelete,
      });
      expect(atDelete).toBeNull();

      // Verify version history
      const history = await getDatasetItemVersionHistory({
        projectId,
        datasetId,
        itemId,
      });
      expect(history.length).toBe(3); // create, update, delete
    });

    it("should handle multiple items versioned together with dataset view", async () => {
      const datasetId = v4();
      const itemId1 = v4();
      const itemId2 = v4();
      const itemId3 = v4();
      await prisma.dataset.create({
        data: { id: datasetId, name: v4(), projectId },
      });

      // T0: Create two items
      await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId1,
        input: { item: 1 },
        normalizeOpts: {},
        validateOpts: {},
      });

      await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId2,
        input: { item: 2 },
        normalizeOpts: {},
        validateOpts: {},
      });

      await delay(10);
      const t0 = new Date();
      await delay(10);

      // T1: Add third item, update first
      await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId3,
        input: { item: 3 },
        normalizeOpts: {},
        validateOpts: {},
      });

      await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId1,
        input: { item: 1, updated: true },
        normalizeOpts: {},
        validateOpts: {},
      });

      await delay(10);
      const t1 = new Date();
      await delay(10);

      // T2: Delete second item
      await deleteDatasetItem({
        projectId,
        datasetItemId: itemId2,
        datasetId,
      });

      await delay(10);
      const t2 = new Date();

      // Verify dataset state at T0: 2 items
      const itemsAtT0 = await getDatasetItems({
        projectId,
        filterState: createDatasetItemFilterState({ datasetIds: [datasetId] }),
        version: t0,
      });
      expect(itemsAtT0.length).toBe(2);

      // Verify dataset state at T1: 3 items
      const itemsAtT1 = await getDatasetItems({
        projectId,
        filterState: createDatasetItemFilterState({ datasetIds: [datasetId] }),
        version: t1,
      });
      expect(itemsAtT1.length).toBe(3);

      // Verify dataset state at T2: 2 items (one deleted)
      const itemsAtT2 = await getDatasetItems({
        projectId,
        filterState: createDatasetItemFilterState({ datasetIds: [datasetId] }),
        version: t2,
      });
      expect(itemsAtT2.length).toBe(2);

      // Verify change counts
      const changesFromT0 = await getDatasetItemChangesSinceVersion({
        projectId,
        datasetId,
        sinceVersion: t0,
      });
      expect(changesFromT0.upserts).toBe(2); // item3 created, item1 updated
      expect(changesFromT0.deletes).toBe(1); // item2 deleted
    });

    it("should maintain version history accuracy across multiple operations", async () => {
      const datasetId = v4();
      const itemId = v4();
      await prisma.dataset.create({
        data: { id: datasetId, name: v4(), projectId },
      });

      const expectedVersionCount = 5;

      for (let i = 1; i <= expectedVersionCount; i++) {
        await upsertDatasetItem({
          projectId,
          datasetId,
          datasetItemId: itemId,
          input: { version: i },
          normalizeOpts: {},
          validateOpts: {},
        });
        await delay(10);
      }

      const history = await getDatasetItemVersionHistory({
        projectId,
        datasetId,
        itemId,
      });

      expect(history.length).toBe(expectedVersionCount);

      // Verify we can retrieve each version
      for (let i = 0; i < history.length; i++) {
        const item = await getDatasetItemById({
          projectId,
          datasetItemId: itemId,
          version: history[i],
        });

        expect(item).not.toBeNull();
        expect(item?.input).toHaveProperty("version");
      }
    });
  });

  describe("valid_to timestamp tests", () => {
    it("should set valid_to on old version when upserting", async () => {
      const datasetId = v4();
      const itemId = v4();
      await prisma.dataset.create({
        data: { id: datasetId, name: v4(), projectId },
      });

      // Create v1
      await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId,
        input: { version: 1 },
        normalizeOpts: {},
        validateOpts: {},
      });

      await delay(10);

      // Create v2 - should invalidate v1
      await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId,
        input: { version: 2 },
        normalizeOpts: {},
        validateOpts: {},
      });

      // Check database directly
      const allVersions = await prisma.datasetItem.findMany({
        where: { id: itemId, projectId },
        orderBy: { validFrom: "asc" },
      });

      expect(allVersions.length).toBe(2);

      // v1 should have valid_to set
      expect(allVersions[0].validTo).not.toBeNull();
      expect(allVersions[0].validTo?.getTime()).toBe(
        allVersions[1].validFrom.getTime(),
      );

      // v2 (current) should have valid_to as null
      expect(allVersions[1].validTo).toBeNull();
    });

    it("should set valid_to on old version when deleting", async () => {
      const datasetId = v4();
      const itemId = v4();
      await prisma.dataset.create({
        data: { id: datasetId, name: v4(), projectId },
      });

      // Create item
      await upsertDatasetItem({
        projectId,
        datasetId,
        datasetItemId: itemId,
        input: { key: "value" },
        normalizeOpts: {},
        validateOpts: {},
      });

      await delay(10);

      // Delete item - should invalidate old version
      await deleteDatasetItem({
        projectId,
        datasetItemId: itemId,
      });

      // Check database directly
      const allVersions = await prisma.datasetItem.findMany({
        where: { id: itemId, projectId },
        orderBy: { validFrom: "asc" },
      });

      expect(allVersions.length).toBe(2);

      // Old version should have valid_to set
      expect(allVersions[0].validTo).not.toBeNull();
      expect(allVersions[0].validTo?.getTime()).toBe(
        allVersions[1].validFrom.getTime(),
      );

      // Delete marker should have valid_to as null
      expect(allVersions[1].validTo).toBeNull();
      expect(allVersions[1].isDeleted).toBe(true);
    });
  });

  describe("getDatasetItems() with search", () => {
    it("should search dataset items by expected output only", async () => {
      const datasetId = v4();
      await prisma.dataset.create({
        data: { id: datasetId, name: v4(), projectId },
      });

      // Create dataset items with distinct input and expected output
      const item1 = await createDatasetItem({
        projectId,
        datasetId,
        input: { query: "simple input text" },
        expectedOutput: { result: "unique_output_search_keyword" },
        normalizeOpts: {},
        validateOpts: {},
      });

      const item2 = await createDatasetItem({
        projectId,
        datasetId,
        input: { query: "another input with keyword" },
        expectedOutput: { result: "different output" },
        normalizeOpts: {},
        validateOpts: {},
      });

      if (!item1.success || !item2.success) {
        throw new Error("Failed to create items");
      }

      // Search for keyword that only exists in expected output
      const searchResults = await getDatasetItems({
        projectId,
        filterState: createDatasetItemFilterState({ datasetIds: [datasetId] }),
        limit: 100,
        page: 0,
        searchQuery: "unique_output_search_keyword",
        searchType: ["output"], // Search only in expected output
      });

      expect(searchResults.length).toBe(1);
      expect(searchResults[0].id).toBe(item1.datasetItem.id);
      expect(searchResults[0].expectedOutput).toEqual({
        result: "unique_output_search_keyword",
      });
    });
  });
});
