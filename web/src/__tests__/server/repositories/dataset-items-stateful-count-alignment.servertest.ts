vi.hoisted(() => {
  // STATEFUL reads with historical rows present (mixed-mode / versioned writes).
  process.env.LANGFUSE_DATASET_SERVICE_READ_FROM_VERSIONED_IMPLEMENTATION =
    "false";
  process.env.LANGFUSE_DATASET_SERVICE_WRITE_TO_VERSIONED_IMPLEMENTATION =
    "false";
});

import { prisma } from "@langfuse/shared/src/db";
import {
  countDatasetItemVariableMatches,
  createDatasetItemFilterState,
  getDatasetItemsCount,
} from "@langfuse/shared/src/server";
import { v4 } from "uuid";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

describe("STATEFUL getDatasetItemsCount vs countDatasetItemVariableMatches", () => {
  it("excludes superseded and deleted rows from both aggregates", async () => {
    const datasetId = v4();
    await prisma.dataset.create({
      data: { id: datasetId, name: v4(), projectId },
    });

    const currentItemId = v4();
    const supersededItemId = v4();
    const deletedItemId = v4();
    const now = new Date();
    const earlier = new Date(now.getTime() - 60_000);

    // Current ACTIVE row — should count.
    await prisma.datasetItem.create({
      data: {
        id: currentItemId,
        projectId,
        datasetId,
        status: "ACTIVE",
        input: { name: "Ada" },
        expectedOutput: "ok",
        validFrom: now,
        validTo: null,
        isDeleted: false,
      },
    });

    // Superseded historical row for another logical item — must not inflate totals.
    await prisma.datasetItem.create({
      data: {
        id: supersededItemId,
        projectId,
        datasetId,
        status: "ACTIVE",
        input: { name: "Grace" },
        expectedOutput: "ok",
        validFrom: earlier,
        validTo: now,
        isDeleted: false,
      },
    });
    await prisma.datasetItem.create({
      data: {
        id: supersededItemId,
        projectId,
        datasetId,
        status: "ACTIVE",
        input: { name: "Grace", city: "London" },
        expectedOutput: "ok",
        validFrom: now,
        validTo: null,
        isDeleted: false,
      },
    });

    // Soft-deleted current row — must not count.
    await prisma.datasetItem.create({
      data: {
        id: deletedItemId,
        projectId,
        datasetId,
        status: "ACTIVE",
        input: { name: "Deleted" },
        expectedOutput: "ok",
        validFrom: now,
        validTo: null,
        isDeleted: true,
      },
    });

    const filterState = createDatasetItemFilterState({
      datasetIds: [datasetId],
      status: "ACTIVE",
    });

    const [totalItems, variablesMap] = await Promise.all([
      getDatasetItemsCount({ projectId, filterState }),
      countDatasetItemVariableMatches({
        projectId,
        filterState,
        variables: ["name", "city"],
      }),
    ]);

    // Two current non-deleted ACTIVE rows: currentItemId + supersededItemId latest.
    expect(totalItems).toBe(2);
    expect(variablesMap).toEqual({ name: 2, city: 1 });
  });
});
