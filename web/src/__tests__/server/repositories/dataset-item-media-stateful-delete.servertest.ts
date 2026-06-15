vi.hoisted(() => {
  process.env.LANGFUSE_DATASET_SERVICE_READ_FROM_VERSIONED_IMPLEMENTATION =
    "false";
  process.env.LANGFUSE_DATASET_SERVICE_WRITE_TO_VERSIONED_IMPLEMENTATION =
    "false";
});

import crypto from "crypto";

import { prisma } from "@langfuse/shared/src/db";
import {
  createDatasetItem,
  deleteDatasetItem,
} from "@langfuse/shared/src/server";
import { v4 } from "uuid";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

const createMediaRow = async () => {
  const sha256Hash = crypto.createHash("sha256").update(v4()).digest("base64");
  const mediaId = sha256Hash
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .slice(0, 22);

  await prisma.media.create({
    data: {
      id: mediaId,
      projectId,
      sha256Hash,
      bucketPath: `media/${mediaId}.png`,
      bucketName: "test-bucket",
      contentType: "image/png",
      contentLength: 1234,
      uploadHttpStatus: 200,
    },
  });

  return {
    mediaId,
    referenceString: `@@@langfuseMedia:type=image/png|id=${mediaId}|source=base64@@@`,
  };
};

const createDataset = async () => {
  const datasetId = v4();
  await prisma.dataset.create({
    data: { id: datasetId, name: v4(), projectId },
  });
  return datasetId;
};

describe("Dataset item media stateful delete", () => {
  it("removes media rows and releases media when deleting a stateful item", async () => {
    const datasetId = await createDataset();
    const media = await createMediaRow();
    await prisma.traceMedia.create({
      data: {
        id: v4(),
        projectId,
        traceId: v4(),
        mediaId: media.mediaId,
        field: "input",
      },
    });

    const result = await createDatasetItem({
      projectId,
      datasetId,
      input: { image: media.referenceString },
    });
    if (!result.success) throw new Error(result.message);

    const itemId = result.datasetItem.id;
    await deleteDatasetItem({ projectId, datasetItemId: itemId });

    await expect(
      prisma.datasetItem.findFirst({ where: { projectId, id: itemId } }),
    ).resolves.toBeNull();
    await expect(
      prisma.datasetItemMedia.findMany({
        where: { projectId, datasetItemId: itemId },
      }),
    ).resolves.toEqual([]);
    const kept = await prisma.media.findUnique({
      where: { projectId_id: { projectId, id: media.mediaId } },
    });
    expect(kept?.retainedByDatasetAt).toBeNull();
  });
});
