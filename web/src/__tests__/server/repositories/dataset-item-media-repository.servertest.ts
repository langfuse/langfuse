import crypto from "crypto";

import { prisma } from "@langfuse/shared/src/db";
import {
  createDatasetItem,
  createManyDatasetItems,
  syncDatasetItemMedia,
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

const getItemMediaRows = (datasetItemId: string) =>
  prisma.datasetItemMedia.findMany({
    where: { projectId, datasetItemId },
    orderBy: [{ field: "asc" }, { jsonPath: "asc" }],
  });

describe("Dataset Item Media Associations", () => {
  it("records media references of created items and marks media as dataset-retained", async () => {
    const datasetId = await createDataset();
    const inputMedia = await createMediaRow();
    const outputMedia = await createMediaRow();
    const metadataMedia = await createMediaRow();

    const result = await createDatasetItem({
      projectId,
      datasetId,
      input: { image: inputMedia.referenceString },
      expectedOutput: { references: [outputMedia.referenceString] },
      metadata: metadataMedia.referenceString,
    });
    if (!result.success) throw new Error(result.message);
    const itemId = result.datasetItem.id;

    const rows = await getItemMediaRows(itemId);
    expect(rows).toMatchObject([
      {
        field: "expected_output",
        jsonPath: "$['references'][0]",
        mediaId: outputMedia.mediaId,
      },
      {
        field: "input",
        jsonPath: "$['image']",
        mediaId: inputMedia.mediaId,
      },
      {
        field: "metadata",
        jsonPath: "$",
        mediaId: metadataMedia.mediaId,
      },
    ]);

    const item = await prisma.datasetItem.findFirst({
      where: { projectId, id: itemId },
    });
    expect(rows[0].datasetItemValidFrom).toEqual(item?.validFrom);

    for (const { mediaId } of [inputMedia, outputMedia, metadataMedia]) {
      const media = await prisma.media.findUnique({
        where: { projectId_id: { projectId, id: mediaId } },
      });
      expect(media?.retainedByDatasetAt).toEqual(expect.any(Date));
    }
  });

  it("creates no rows for items without media references", async () => {
    const datasetId = await createDataset();

    const result = await createDatasetItem({
      projectId,
      datasetId,
      input: { question: "what is the capital of France?" },
    });
    if (!result.success) throw new Error(result.message);

    await expect(getItemMediaRows(result.datasetItem.id)).resolves.toEqual([]);
  });

  it("rejects references to unknown media before writing the item", async () => {
    const datasetId = await createDataset();
    const unknownMediaId = v4();
    const datasetItemId = v4();

    await expect(
      createManyDatasetItems({
        projectId,
        items: [
          {
            datasetId,
            id: datasetItemId,
            input: {
              image: `@@@langfuseMedia:type=image/png|id=${unknownMediaId}|source=base64@@@`,
            },
          },
        ],
      }),
    ).rejects.toThrow(
      `Dataset item references unknown media: ${unknownMediaId}`,
    );

    await expect(
      prisma.datasetItem.findFirst({
        where: { projectId, id: datasetItemId },
      }),
    ).resolves.toBeNull();
  });

  it("records media references for bulk created items", async () => {
    const datasetId = await createDataset();
    const firstMedia = await createMediaRow();
    const secondMedia = await createMediaRow();

    const result = await createManyDatasetItems({
      projectId,
      items: [
        { datasetId, input: { image: firstMedia.referenceString } },
        { datasetId, input: { question: "no media" } },
        { datasetId, expectedOutput: [secondMedia.referenceString] },
      ],
    });
    if (!result.success) throw new Error("bulk create failed");
    const [first, second, third] = result.datasetItems;

    await expect(getItemMediaRows(first.id)).resolves.toMatchObject([
      { field: "input", jsonPath: "$['image']", mediaId: firstMedia.mediaId },
    ]);
    await expect(getItemMediaRows(second.id)).resolves.toEqual([]);
    await expect(getItemMediaRows(third.id)).resolves.toMatchObject([
      {
        field: "expected_output",
        jsonPath: "$[0]",
        mediaId: secondMedia.mediaId,
      },
    ]);
  });

  describe("syncDatasetItemMedia", () => {
    // Covers the STATEFUL in-place update path, where the item version
    // (id, validFrom) stays the same and removed references must be unlinked
    it("replaces rows of the same item version with replaceExisting", async () => {
      const oldMedia = await createMediaRow();
      const keptMedia = await createMediaRow();
      const newMedia = await createMediaRow();
      const datasetItemId = v4();
      const datasetItemValidFrom = new Date();

      await syncDatasetItemMedia({
        projectId,
        items: [
          {
            datasetItemId,
            datasetItemValidFrom,
            input: { image: oldMedia.referenceString },
            expectedOutput: { reference: keptMedia.referenceString },
          },
        ],
      });

      await syncDatasetItemMedia({
        projectId,
        items: [
          {
            datasetItemId,
            datasetItemValidFrom,
            input: { image: newMedia.referenceString },
            expectedOutput: { reference: keptMedia.referenceString },
          },
        ],
        replaceExisting: true,
      });

      await expect(getItemMediaRows(datasetItemId)).resolves.toMatchObject([
        {
          field: "expected_output",
          jsonPath: "$['reference']",
          mediaId: keptMedia.mediaId,
        },
        { field: "input", jsonPath: "$['image']", mediaId: newMedia.mediaId },
      ]);
    });

    it("removes all rows when references are gone and replaceExisting is set", async () => {
      const media = await createMediaRow();
      const datasetItemId = v4();
      const datasetItemValidFrom = new Date();

      await syncDatasetItemMedia({
        projectId,
        items: [
          {
            datasetItemId,
            datasetItemValidFrom,
            input: { image: media.referenceString },
          },
        ],
      });

      await syncDatasetItemMedia({
        projectId,
        items: [
          {
            datasetItemId,
            datasetItemValidFrom,
            input: { question: "no media anymore" },
          },
        ],
        replaceExisting: true,
      });

      await expect(getItemMediaRows(datasetItemId)).resolves.toEqual([]);
    });
  });
});
