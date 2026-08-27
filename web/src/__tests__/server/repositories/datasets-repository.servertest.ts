import { prisma } from "@langfuse/shared/src/db";
import {
  createOrgProjectAndApiKey,
  deleteDatasetsByIds,
  findDatasetIdsByIds,
  findDatasetIdsForBatchDeletion,
  findDatasetsForDeletion,
} from "@langfuse/shared/src/server";
import { v4 } from "uuid";
import { afterAll, describe, expect, it } from "vitest";

const orgIds: string[] = [];

async function createProject() {
  const { org, project } = await createOrgProjectAndApiKey();
  orgIds.push(org.id);

  return project;
}

async function createDataset({
  createdAt,
  name,
  projectId,
}: {
  createdAt?: Date;
  name: string;
  projectId: string;
}) {
  return prisma.dataset.create({
    data: {
      id: v4(),
      createdAt,
      name,
      projectId,
    },
  });
}

describe("datasets repository", () => {
  afterAll(async () => {
    await prisma.organization.deleteMany({
      where: {
        id: { in: orgIds },
      },
    });
  });

  it("finds datasets selected directly or via folder subtrees, without the same-named standalone dataset", async () => {
    const project = await createProject();
    const otherProject = await createProject();
    const selectedDataset = await createDataset({
      name: `selected-${v4()}`,
      projectId: project.id,
    });
    // Standalone dataset named exactly like the folder — its own row, must NOT
    // be deleted when only the "folder" subtree is targeted.
    const standaloneFolderNamedDataset = await createDataset({
      name: "folder",
      projectId: project.id,
    });
    const nestedFolderDataset = await createDataset({
      name: "folder/nested",
      projectId: project.id,
    });
    await createDataset({
      name: "folder-sibling/nested",
      projectId: project.id,
    });
    await createDataset({
      name: selectedDataset.name,
      projectId: otherProject.id,
    });

    const datasets = await findDatasetsForDeletion({
      projectId: project.id,
      datasetIds: [selectedDataset.id],
      folderPaths: ["folder"],
    });

    const ids = datasets.map((dataset) => dataset.id);
    expect(ids.sort()).toEqual(
      [nestedFolderDataset.id, selectedDataset.id].sort(),
    );
    expect(ids).not.toContain(standaloneFolderNamedDataset.id);
  });

  it("treats SQL LIKE wildcards in folder names literally, sparing unrelated siblings", async () => {
    const project = await createProject();
    // Folder names derive from dataset names and can contain `%` / `_`. Without
    // escaping, deleting folder "100%" or "a_b" would also wipe siblings whose
    // names happen to match the wildcard (e.g. "1000/x", "aXb/x").
    const percentChild = await createDataset({
      name: "100%/child",
      projectId: project.id,
    });
    const percentSibling = await createDataset({
      name: "1000/sibling",
      projectId: project.id,
    });
    const underscoreChild = await createDataset({
      name: "a_b/child",
      projectId: project.id,
    });
    const underscoreSibling = await createDataset({
      name: "aXb/sibling",
      projectId: project.id,
    });

    const deleted = await findDatasetsForDeletion({
      projectId: project.id,
      datasetIds: [],
      folderPaths: ["100%", "a_b"],
    });

    const deletedIds = deleted.map((dataset) => dataset.id);
    expect(deletedIds.sort()).toEqual(
      [percentChild.id, underscoreChild.id].sort(),
    );
    expect(deletedIds).not.toContain(percentSibling.id);
    expect(deletedIds).not.toContain(underscoreSibling.id);
  });

  it("returns no deletion candidates without explicit dataset or folder inputs", async () => {
    const project = await createProject();
    await createDataset({
      name: `unselected-${v4()}`,
      projectId: project.id,
    });

    await expect(
      findDatasetsForDeletion({
        projectId: project.id,
        datasetIds: [],
        folderPaths: [],
      }),
    ).resolves.toEqual([]);
  });

  it("finds batch deletion dataset ids with cutoff, search query, and folder path", async () => {
    const project = await createProject();
    const otherProject = await createProject();
    const cutoffCreatedAt = new Date("2024-01-02T00:00:00.000Z");
    const matchingDataset = await createDataset({
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      name: "folder/target-dataset",
      projectId: project.id,
    });
    await createDataset({
      createdAt: new Date("2024-01-03T00:00:00.000Z"),
      name: "folder/target-too-new",
      projectId: project.id,
    });
    await createDataset({
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      name: "other/target-dataset",
      projectId: project.id,
    });
    await createDataset({
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      name: "folder/not-matching",
      projectId: project.id,
    });
    await createDataset({
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      name: "folder/target-dataset",
      projectId: otherProject.id,
    });

    const datasets = await findDatasetIdsForBatchDeletion({
      projectId: project.id,
      cutoffCreatedAt,
      query: {
        filter: null,
        orderBy: { column: "createdAt", order: "DESC" },
        searchQuery: "target",
        pathPrefix: "folder",
      },
    });

    expect(datasets).toEqual([{ id: matchingDataset.id }]);
  });

  it("finds selected dataset ids scoped to a project", async () => {
    const project = await createProject();
    const otherProject = await createProject();
    const selectedDataset = await createDataset({
      name: `selected-${v4()}`,
      projectId: project.id,
    });
    const otherDataset = await createDataset({
      name: `other-${v4()}`,
      projectId: otherProject.id,
    });

    const datasets = await findDatasetIdsByIds({
      projectId: project.id,
      datasetIds: [selectedDataset.id, otherDataset.id],
    });

    expect(datasets).toEqual([{ id: selectedDataset.id }]);
  });

  it("deletes datasets by ids scoped to a project", async () => {
    const project = await createProject();
    const otherProject = await createProject();
    const datasetToDelete = await createDataset({
      name: `delete-${v4()}`,
      projectId: project.id,
    });
    const datasetToKeep = await createDataset({
      name: `keep-${v4()}`,
      projectId: project.id,
    });
    const otherProjectDataset = await createDataset({
      name: `other-${v4()}`,
      projectId: otherProject.id,
    });

    await deleteDatasetsByIds({
      projectId: project.id,
      datasetIds: [datasetToDelete.id, otherProjectDataset.id],
    });

    await expect(
      prisma.dataset.findMany({
        where: { projectId: project.id },
        select: { id: true },
      }),
    ).resolves.toEqual([{ id: datasetToKeep.id }]);
    await expect(
      prisma.dataset.findUnique({
        where: {
          id_projectId: {
            id: otherProjectDataset.id,
            projectId: otherProject.id,
          },
        },
      }),
    ).resolves.toMatchObject({ id: otherProjectDataset.id });
  });

  it("skips deletion when no dataset ids are provided", async () => {
    const project = await createProject();
    const dataset = await createDataset({
      name: `keep-${v4()}`,
      projectId: project.id,
    });

    await deleteDatasetsByIds({
      projectId: project.id,
      datasetIds: [],
    });

    await expect(
      prisma.dataset.findUnique({
        where: {
          id_projectId: {
            id: dataset.id,
            projectId: project.id,
          },
        },
      }),
    ).resolves.toMatchObject({ id: dataset.id });
  });
});
