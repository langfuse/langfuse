import crypto from "crypto";

import { prisma } from "@langfuse/shared/src/db";
import {
  createDatasetItem,
  createManyDatasetItems,
  deleteDatasetMediaByDatasetId,
  findExpiredMediaByProjectId,
  releaseDatasetMedia,
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
      const datasetId = v4();
      const datasetItemId = v4();
      const datasetItemValidFrom = new Date();

      await syncDatasetItemMedia({
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

      await syncDatasetItemMedia({
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
          field: "expected_output",
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

      await syncDatasetItemMedia({
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

      await syncDatasetItemMedia({
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

    it("releases media on dataset deletion based on remaining references", async () => {
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

      const deletedPaths: string[] = [];
      await deleteDatasetMediaByDatasetId({
        projectId,
        datasetId,
        storageClient: {
          deleteFiles: async (paths) => {
            deletedPaths.push(...paths);
          },
        },
      });

      // dataset-only media is fully deleted, including its S3 file
      expect(deletedPaths).toEqual([`media/${datasetOnlyMedia.mediaId}.png`]);
      await expect(
        prisma.media.findUnique({
          where: {
            projectId_id: { projectId, id: datasetOnlyMedia.mediaId },
          },
        }),
      ).resolves.toBeNull();

      // trace-shared media survives but is released for retention
      const tracedMedia = await prisma.media.findUnique({
        where: { projectId_id: { projectId, id: traceSharedMedia.mediaId } },
      });
      expect(tracedMedia?.retainedByDatasetAt).toBeNull();

      // media shared with another dataset stays fully retained
      const sharedMedia = await prisma.media.findUnique({
        where: { projectId_id: { projectId, id: datasetSharedMedia.mediaId } },
      });
      expect(sharedMedia?.retainedByDatasetAt).toEqual(expect.any(Date));
      await expect(
        prisma.datasetItemMedia.count({ where: { projectId, datasetId } }),
      ).resolves.toBe(0);
      await expect(
        prisma.datasetItemMedia.count({
          where: { projectId, datasetId: otherDatasetId },
        }),
      ).resolves.toBe(1);
    });

    it("excludes dataset-retained media from retention cleanup", async () => {
      const datasetId = await createDataset();
      const retainedMedia = await createMediaRow();
      const unretainedMedia = await createMediaRow();
      await createItemWithMedia(datasetId, retainedMedia.referenceString);

      const past = new Date(Date.now() - 1000 * 60 * 60 * 24 * 3);
      await prisma.media.updateMany({
        where: {
          projectId,
          id: { in: [retainedMedia.mediaId, unretainedMedia.mediaId] },
        },
        data: { createdAt: past },
      });

      const expired = await findExpiredMediaByProjectId({
        projectId,
        cutoffDate: new Date(Date.now() - 1000 * 60 * 60 * 24),
      });

      const expiredIds = expired.map((media) => media.id);
      expect(expiredIds).toContain(unretainedMedia.mediaId);
      expect(expiredIds).not.toContain(retainedMedia.mediaId);
    });
  });

  describe("orphan release on in-place changes", () => {
    const collectingStorageClient = () => {
      const deletedPaths: string[] = [];
      return {
        deletedPaths,
        client: {
          deleteFiles: async (paths: string[]) => {
            deletedPaths.push(...paths);
          },
        },
      };
    };

    const linkTrace = (mediaId: string) =>
      prisma.traceMedia.create({
        data: { id: v4(), projectId, traceId: v4(), mediaId, field: "input" },
      });

    // releaseDatasetMedia: the three outcomes, with an injected storage client
    it("deletes media with no remaining references", async () => {
      const media = await createMediaRow();
      await syncDatasetItemMedia({
        projectId,
        items: [
          {
            datasetId: v4(),
            datasetItemId: v4(),
            datasetItemValidFrom: new Date(),
            input: { image: media.referenceString },
          },
        ],
        replaceExisting: false,
      });
      // simulate the rows being removed by an in-place change
      await prisma.datasetItemMedia.deleteMany({
        where: { projectId, mediaId: media.mediaId },
      });

      const { deletedPaths, client } = collectingStorageClient();
      await releaseDatasetMedia({
        projectId,
        mediaIds: [media.mediaId],
        storageClient: client,
      });

      expect(deletedPaths).toEqual([`media/${media.mediaId}.png`]);
      await expect(
        prisma.media.findUnique({
          where: { projectId_id: { projectId, id: media.mediaId } },
        }),
      ).resolves.toBeNull();
    });

    it("un-retains media still referenced by a trace instead of deleting it", async () => {
      const media = await createMediaRow();
      await prisma.media.update({
        where: { projectId_id: { projectId, id: media.mediaId } },
        data: { retainedByDatasetAt: new Date() },
      });
      await linkTrace(media.mediaId);

      const { deletedPaths, client } = collectingStorageClient();
      await releaseDatasetMedia({
        projectId,
        mediaIds: [media.mediaId],
        storageClient: client,
      });

      expect(deletedPaths).toEqual([]);
      const kept = await prisma.media.findUnique({
        where: { projectId_id: { projectId, id: media.mediaId } },
      });
      expect(kept).not.toBeNull();
      expect(kept?.retainedByDatasetAt).toBeNull();
    });

    it("keeps media still referenced by another dataset item", async () => {
      const media = await createMediaRow();
      await prisma.media.update({
        where: { projectId_id: { projectId, id: media.mediaId } },
        data: { retainedByDatasetAt: new Date() },
      });
      await prisma.datasetItemMedia.create({
        data: {
          id: v4(),
          projectId,
          datasetId: v4(),
          datasetItemId: v4(),
          datasetItemValidFrom: new Date(),
          mediaId: media.mediaId,
          field: "input",
          jsonPath: "$['image']",
          referenceString: media.referenceString,
        },
      });

      const { deletedPaths, client } = collectingStorageClient();
      await releaseDatasetMedia({
        projectId,
        mediaIds: [media.mediaId],
        storageClient: client,
      });

      expect(deletedPaths).toEqual([]);
      const kept = await prisma.media.findUnique({
        where: { projectId_id: { projectId, id: media.mediaId } },
      });
      expect(kept?.retainedByDatasetAt).toEqual(expect.any(Date));
    });

    // wiring: an in-place (replaceExisting) update releases media it dropped
    it("releases media dropped by an in-place update", async () => {
      const media = await createMediaRow();
      const datasetId = v4();
      const datasetItemId = v4();
      const datasetItemValidFrom = new Date();
      await linkTrace(media.mediaId);

      await syncDatasetItemMedia({
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
      expect(
        (
          await prisma.media.findUnique({
            where: { projectId_id: { projectId, id: media.mediaId } },
          })
        )?.retainedByDatasetAt,
      ).toEqual(expect.any(Date));

      await syncDatasetItemMedia({
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
      // trace-referenced, so kept but released for retention
      const kept = await prisma.media.findUnique({
        where: { projectId_id: { projectId, id: media.mediaId } },
      });
      expect(kept?.retainedByDatasetAt).toBeNull();
    });

    // wiring: STATEFUL item deletion replaces the version with a media-less
    // item, which drops its media rows and releases them
    it("releases media when a version's media is dropped to none", async () => {
      const media = await createMediaRow();
      const datasetId = v4();
      const datasetItemId = v4();
      const datasetItemValidFrom = new Date();
      await linkTrace(media.mediaId);

      await syncDatasetItemMedia({
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

      await syncDatasetItemMedia({
        projectId,
        items: [{ datasetId, datasetItemId, datasetItemValidFrom }],
        replaceExisting: true,
      });

      await expect(getItemMediaRows(datasetItemId)).resolves.toEqual([]);
      const kept = await prisma.media.findUnique({
        where: { projectId_id: { projectId, id: media.mediaId } },
      });
      expect(kept?.retainedByDatasetAt).toBeNull();
    });
  });
});
