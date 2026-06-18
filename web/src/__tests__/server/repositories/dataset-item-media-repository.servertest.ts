import crypto from "crypto";

import { prisma } from "@langfuse/shared/src/db";
import {
  createDatasetItem,
  createManyDatasetItems,
  deleteDatasetMediaLinksByDatasetId,
  deleteMediaFiles,
  findExpiredMediaByProjectId,
  linkDatasetItemMedia,
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

const linkDatasetItemMediaForTest = async (
  props: Parameters<typeof linkDatasetItemMedia>[1],
) => {
  await prisma.$transaction((tx) => linkDatasetItemMedia(tx, props));
};

describe("Dataset Item Media Associations", () => {
  it("records media references of created items", async () => {
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
        field: "expectedOutput",
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

    await expect(
      prisma.media.count({
        where: {
          projectId,
          id: {
            in: [
              inputMedia.mediaId,
              outputMedia.mediaId,
              metadataMedia.mediaId,
            ],
          },
        },
      }),
    ).resolves.toBe(3);
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

    const result = await createManyDatasetItems({
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
    });

    expect(result.success).toBe(false);
    expect(result.validationErrors).toEqual([
      expect.objectContaining({
        itemIndex: 0,
        errors: [
          expect.objectContaining({
            message: expect.stringContaining(unknownMediaId),
          }),
        ],
      }),
    ]);
    await expect(
      prisma.datasetItem.findFirst({
        where: { projectId, id: datasetItemId },
      }),
    ).resolves.toBeNull();
  });

  it("groups multiple unresolvable media references in the same field into one validation error", async () => {
    const datasetId = await createDataset();
    const firstUnknownMediaId = v4();
    const secondUnknownMediaId = v4();
    const datasetItemId = v4();

    const result = await createManyDatasetItems({
      projectId,
      items: [
        {
          datasetId,
          id: datasetItemId,
          input: {
            images: [
              `@@@langfuseMedia:type=image/png|id=${firstUnknownMediaId}|source=base64@@@`,
              `@@@langfuseMedia:type=image/png|id=${secondUnknownMediaId}|source=base64@@@`,
            ],
          },
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.successCount).toBe(0);
    expect(result.failedCount).toBe(1);
    expect(result.validationErrors).toEqual([
      {
        itemIndex: 0,
        field: "input",
        errors: [
          expect.objectContaining({
            path: "$['images'][0]",
            message: expect.stringContaining(firstUnknownMediaId),
          }),
          expect.objectContaining({
            path: "$['images'][1]",
            message: expect.stringContaining(secondUnknownMediaId),
          }),
        ],
      },
    ]);
    await expect(
      prisma.datasetItem.findFirst({
        where: { projectId, id: datasetItemId },
      }),
    ).resolves.toBeNull();
  });

  // A media row exists from createMediaUploadUrl before its S3 PUT
  // (uploadHttpStatus null). Referencing it must be rejected like unknown
  // media: linking it would make readers resolve the reference to nothing.
  it("rejects references to media that has not finished uploading", async () => {
    const datasetId = await createDataset();
    const sha256Hash = crypto
      .createHash("sha256")
      .update(v4())
      .digest("base64");
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
        uploadHttpStatus: null,
      },
    });
    const datasetItemId = v4();

    const result = await createManyDatasetItems({
      projectId,
      items: [
        {
          datasetId,
          id: datasetItemId,
          input: {
            image: `@@@langfuseMedia:type=image/png|id=${mediaId}|source=base64@@@`,
          },
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.validationErrors).toEqual([
      expect.objectContaining({
        itemIndex: 0,
        errors: [
          expect.objectContaining({
            message: expect.stringContaining(mediaId),
          }),
        ],
      }),
    ]);
    await expect(
      prisma.datasetItem.findFirst({ where: { projectId, id: datasetItemId } }),
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
        field: "expectedOutput",
        jsonPath: "$[0]",
        mediaId: secondMedia.mediaId,
      },
    ]);
  });

  // Bulk-imported items are frequently never re-edited, so the media link must
  // commit with the item write rather than as a best-effort follow-up.
  it("links media of bulk created items", async () => {
    const datasetId = await createDataset();
    const media = await createMediaRow();

    const result = await createManyDatasetItems({
      projectId,
      items: [{ datasetId, input: { image: media.referenceString } }],
    });
    if (!result.success) throw new Error("bulk create failed");

    const stored = await prisma.media.findUnique({
      where: { projectId_id: { projectId, id: media.mediaId } },
    });
    expect(stored).not.toBeNull();

    // the link is keyed to the version that was actually written
    const item = await prisma.datasetItem.findFirst({
      where: { projectId, id: result.datasetItems[0].id },
    });
    const rows = await getItemMediaRows(result.datasetItems[0].id);
    expect(rows[0]?.datasetItemValidFrom).toEqual(item?.validFrom);
  });

  // An unresolvable media reference must fail only its own item under partial
  // success, not throw and abort the whole batch.
  it("fails only the item with an unresolvable media reference under partial success", async () => {
    const datasetId = await createDataset();
    const goodMedia = await createMediaRow();
    const unknownMediaId = v4();

    const result = await createManyDatasetItems({
      projectId,
      allowPartialSuccess: true,
      items: [
        { datasetId, input: { image: goodMedia.referenceString } },
        {
          datasetId,
          input: {
            image: `@@@langfuseMedia:type=image/png|id=${unknownMediaId}|source=base64@@@`,
          },
        },
      ],
    });
    if (!result.success) throw new Error("expected partial success");

    expect(result.successCount).toBe(1);
    expect(result.failedCount).toBe(1);
    expect(result.datasetItems).toHaveLength(1);
    await expect(
      getItemMediaRows(result.datasetItems[0].id),
    ).resolves.toMatchObject([
      { field: "input", jsonPath: "$['image']", mediaId: goodMedia.mediaId },
    ]);
    expect(result.validationErrors).toEqual([
      expect.objectContaining({
        itemIndex: 1,
        field: "input",
        errors: [
          expect.objectContaining({
            message: expect.stringContaining(unknownMediaId),
          }),
        ],
      }),
    ]);
  });

  describe("linkDatasetItemMedia", () => {
    // Covers the STATEFUL in-place update path, where the item version
    // (id, validFrom) stays the same and removed references must be unlinked
    it("replaces rows of the same item version with replaceExisting", async () => {
      const oldMedia = await createMediaRow();
      const keptMedia = await createMediaRow();
      const newMedia = await createMediaRow();
      const datasetId = v4();
      const datasetItemId = v4();
      const datasetItemValidFrom = new Date();

      await linkDatasetItemMediaForTest({
        projectId,
        items: [
          {
            datasetId,
            datasetItemId,
            datasetItemValidFrom,
            input: { image: oldMedia.referenceString },
            expectedOutput: { reference: keptMedia.referenceString },
          },
        ],
        replaceExisting: false,
      });

      await linkDatasetItemMediaForTest({
        projectId,
        items: [
          {
            datasetId,
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
          field: "expectedOutput",
          jsonPath: "$['reference']",
          mediaId: keptMedia.mediaId,
        },
        { field: "input", jsonPath: "$['image']", mediaId: newMedia.mediaId },
      ]);
    });

    it("removes all rows when references are gone and replaceExisting is set", async () => {
      const media = await createMediaRow();
      const datasetId = v4();
      const datasetItemId = v4();
      const datasetItemValidFrom = new Date();

      await linkDatasetItemMediaForTest({
        projectId,
        items: [
          {
            datasetId,
            datasetItemId,
            datasetItemValidFrom,
            input: { image: media.referenceString },
          },
        ],
        replaceExisting: false,
      });

      await linkDatasetItemMediaForTest({
        projectId,
        items: [
          {
            datasetId,
            datasetItemId,
            datasetItemValidFrom,
            input: { question: "no media anymore" },
          },
        ],
        replaceExisting: true,
      });

      await expect(getItemMediaRows(datasetItemId)).resolves.toEqual([]);
    });

    it("replaces media rows for replaceExisting updates", async () => {
      const droppedMedia = await createMediaRow();
      const keptMedia = await createMediaRow();
      const newMedia = await createMediaRow();
      const datasetId = v4();
      const datasetItemId = v4();
      const datasetItemValidFrom = new Date();

      await linkDatasetItemMediaForTest({
        projectId,
        items: [
          {
            datasetId,
            datasetItemId,
            datasetItemValidFrom,
            input: { image: droppedMedia.referenceString },
            expectedOutput: { image: keptMedia.referenceString },
          },
        ],
        replaceExisting: false,
      });

      await prisma.$transaction((tx) =>
        linkDatasetItemMedia(tx, {
          projectId,
          items: [
            {
              datasetId,
              datasetItemId,
              datasetItemValidFrom,
              input: { image: newMedia.referenceString },
              expectedOutput: { image: keptMedia.referenceString },
            },
          ],
          replaceExisting: true,
        }),
      );

      await expect(getItemMediaRows(datasetItemId)).resolves.toMatchObject([
        { field: "expectedOutput", mediaId: keptMedia.mediaId },
        { field: "input", mediaId: newMedia.mediaId },
      ]);
      await expect(
        prisma.datasetItemMedia.count({
          where: { projectId, mediaId: droppedMedia.mediaId },
        }),
      ).resolves.toBe(0);
    });
  });

  describe("lifecycle", () => {
    const createItemWithMedia = async (
      datasetId: string,
      referenceString: string,
    ) => {
      const result = await createDatasetItem({
        projectId,
        datasetId,
        input: { image: referenceString },
      });
      if (!result.success) throw new Error(result.message);
      return result.datasetItem.id;
    };

    it("deletes dataset media associations on dataset deletion", async () => {
      const datasetId = await createDataset();
      const otherDatasetId = await createDataset();
      const datasetOnlyMedia = await createMediaRow();
      const traceSharedMedia = await createMediaRow();
      const datasetSharedMedia = await createMediaRow();

      await createItemWithMedia(datasetId, datasetOnlyMedia.referenceString);
      await createItemWithMedia(datasetId, traceSharedMedia.referenceString);
      await createItemWithMedia(datasetId, datasetSharedMedia.referenceString);
      await createItemWithMedia(
        otherDatasetId,
        datasetSharedMedia.referenceString,
      );
      await prisma.traceMedia.create({
        data: {
          id: v4(),
          projectId,
          traceId: v4(),
          mediaId: traceSharedMedia.mediaId,
          field: "input",
        },
      });

      await deleteDatasetMediaLinksByDatasetId({
        projectId,
        datasetId,
      });

      await expect(
        prisma.media.count({
          where: {
            projectId,
            id: {
              in: [
                datasetOnlyMedia.mediaId,
                traceSharedMedia.mediaId,
                datasetSharedMedia.mediaId,
              ],
            },
          },
        }),
      ).resolves.toBe(3);
      await expect(
        prisma.datasetItemMedia.count({ where: { projectId, datasetId } }),
      ).resolves.toBe(0);
      await expect(
        prisma.datasetItemMedia.count({
          where: { projectId, datasetId: otherDatasetId },
        }),
      ).resolves.toBe(1);
    });

    it("skips dataset-associated media during retention deletion", async () => {
      const datasetId = await createDataset();
      const associatedMedia = await createMediaRow();
      const unassociatedMedia = await createMediaRow();
      await createItemWithMedia(datasetId, associatedMedia.referenceString);

      const past = new Date(Date.now() - 1000 * 60 * 60 * 24 * 3);
      await prisma.media.updateMany({
        where: {
          projectId,
          id: { in: [associatedMedia.mediaId, unassociatedMedia.mediaId] },
        },
        data: { createdAt: past },
      });

      const expired = await findExpiredMediaByProjectId({
        projectId,
        cutoffDate: new Date(Date.now() - 1000 * 60 * 60 * 24),
      });

      const expiredIds = expired.map((media) => media.id);
      expect(expiredIds).toContain(unassociatedMedia.mediaId);
      expect(expiredIds).toContain(associatedMedia.mediaId);

      const relevantExpired = expired.filter((media) =>
        [associatedMedia.mediaId, unassociatedMedia.mediaId].includes(media.id),
      );
      const deletedPaths: string[] = [];
      const deletedCount = await deleteMediaFiles({
        projectId,
        mediaFiles: relevantExpired,
        storageClient: {
          deleteFiles: async (paths) => {
            deletedPaths.push(...paths);
          },
        },
      });

      expect(deletedCount).toBe(1);
      expect(deletedPaths).toEqual([`media/${unassociatedMedia.mediaId}.png`]);
      await expect(
        prisma.media.findUnique({
          where: { projectId_id: { projectId, id: associatedMedia.mediaId } },
        }),
      ).resolves.not.toBeNull();
      await expect(
        prisma.media.findUnique({
          where: {
            projectId_id: { projectId, id: unassociatedMedia.mediaId },
          },
        }),
      ).resolves.toBeNull();
    });
  });

  describe("in-place changes", () => {
    it("unlinks media dropped by an in-place update without deleting media", async () => {
      const media = await createMediaRow();
      const datasetId = v4();
      const datasetItemId = v4();
      const datasetItemValidFrom = new Date();

      await linkDatasetItemMediaForTest({
        projectId,
        items: [
          {
            datasetId,
            datasetItemId,
            datasetItemValidFrom,
            input: { image: media.referenceString },
          },
        ],
        replaceExisting: false,
      });

      await linkDatasetItemMediaForTest({
        projectId,
        items: [
          {
            datasetId,
            datasetItemId,
            datasetItemValidFrom,
            input: { text: "no media anymore" },
          },
        ],
        replaceExisting: true,
      });

      await expect(getItemMediaRows(datasetItemId)).resolves.toEqual([]);
      await expect(
        prisma.media.findUnique({
          where: { projectId_id: { projectId, id: media.mediaId } },
        }),
      ).resolves.not.toBeNull();
    });
  });
});
