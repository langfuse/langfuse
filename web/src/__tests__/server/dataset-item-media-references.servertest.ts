import crypto from "crypto";
import type { Session } from "next-auth";

import {
  getDatasetItemForApi,
  listDatasetItemsForApi,
} from "@/src/features/datasets/server/publicDatasetService";
import {
  GetDatasetItemsV1Response,
  GetDatasetItemV1Response,
} from "@/src/features/public-api/types/datasets";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { prisma } from "@langfuse/shared/src/db";
import { createDatasetItem } from "@langfuse/shared/src/server";
import { v4 } from "uuid";
import { env } from "@/src/env.mjs";
import { MediaContentType } from "@/src/features/media/validation";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

const session: Session = {
  expires: "1",
  user: {
    id: "user-1",
    canCreateOrganizations: true,
    name: "Demo User",
    organizations: [
      {
        id: "seed-org-id",
        name: "Test Organization",
        role: "OWNER",
        plan: "cloud:hobby",
        cloudConfig: undefined,
        metadata: {},
        aiFeaturesEnabled: false,
        aiTelemetryEnabled: false,
        projects: [
          {
            id: projectId,
            role: "ADMIN",
            retentionDays: 30,
            deletedAt: null,
            hasTraces: false,
            name: "Test Project",
            metadata: {},
            createdAt: new Date().toISOString(),
          },
        ],
      },
    ],
    featureFlags: {
      excludeClickhouseRead: false,
      templateFlag: true,
      inAppAgent: false,
      v4BetaToggleVisible: false,
      observationEvals: false,
      experimentsV4Enabled: false,
    },
    admin: true,
  },
  environment: {} as never,
};
const caller = appRouter.createCaller({
  ...createInnerTRPCContext({ session, headers: {} }),
  prisma,
});

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
      contentType: MediaContentType.PNG,
      contentLength: 1234,
      uploadHttpStatus: 200,
    },
  });

  return {
    mediaId,
    referenceString: `@@@langfuseMedia:type=image/png|id=${mediaId}|source=base64@@@`,
  };
};

const createDatasetWithItem = async (
  input: unknown,
  expectedOutput?: unknown,
) => {
  const datasetName = v4();
  const dataset = await prisma.dataset.create({
    data: { id: v4(), name: datasetName, projectId },
  });

  const result = await createDatasetItem({
    projectId,
    datasetId: dataset.id,
    input,
    expectedOutput,
  });
  if (!result.success) throw new Error(result.message);

  return { datasetName, datasetItemId: result.datasetItem.id };
};

describe("Dataset item media references (public API read path)", () => {
  it("resolves media references on the single item endpoint", async () => {
    const media = await createMediaRow();
    const outputMedia = await createMediaRow();
    const { datasetItemId } = await createDatasetWithItem(
      { image: media.referenceString },
      { reference: outputMedia.referenceString },
    );

    const item = await getDatasetItemForApi({
      projectId,
      datasetItemId,
      includeMediaReferences: true,
    });

    expect(GetDatasetItemV1Response.parse(item).mediaReferences).toEqual([
      {
        field: "expectedOutput",
        referenceString: outputMedia.referenceString,
        jsonPath: "$['reference']",
        media: expect.objectContaining({ mediaId: outputMedia.mediaId }),
      },
      {
        field: "input",
        referenceString: media.referenceString,
        jsonPath: "$['image']",
        media: {
          mediaId: media.mediaId,
          contentType: MediaContentType.PNG,
          contentLength: 1234,
          url: expect.any(String),
          urlExpiry: expect.any(String),
        },
      },
    ]);
  });

  it("omits mediaReferences without the flag", async () => {
    const media = await createMediaRow();
    const { datasetItemId } = await createDatasetWithItem({
      image: media.referenceString,
    });

    const item = await getDatasetItemForApi({
      projectId,
      datasetItemId,
      includeMediaReferences: false,
    });

    expect(GetDatasetItemV1Response.parse(item)).not.toHaveProperty(
      "mediaReferences",
    );
  });

  it("resolves media references per item on the list endpoint", async () => {
    const media = await createMediaRow();
    const { datasetName } = await createDatasetWithItem({
      image: media.referenceString,
    });

    const response = await listDatasetItemsForApi({
      projectId,
      datasetName,
      includeMediaReferences: true,
      page: 1,
      limit: 50,
    });
    const parsed = GetDatasetItemsV1Response.parse(response);

    expect(parsed.data).toHaveLength(1);
    expect(parsed.data[0].mediaReferences).toEqual([
      expect.objectContaining({
        field: "input",
        jsonPath: "$['image']",
        media: expect.objectContaining({ mediaId: media.mediaId }),
      }),
    ]);
  });

  it("returns empty mediaReferences for items without media", async () => {
    const { datasetItemId } = await createDatasetWithItem({
      question: "no media here",
    });

    const item = await getDatasetItemForApi({
      projectId,
      datasetItemId,
      includeMediaReferences: true,
    });

    expect(item.mediaReferences).toEqual([]);
  });

  it("returns media null for references whose media no longer exists", async () => {
    const media = await createMediaRow();
    const { datasetItemId } = await createDatasetWithItem({
      image: media.referenceString,
    });

    await prisma.media.delete({
      where: { projectId_id: { projectId, id: media.mediaId } },
    });

    const item = await getDatasetItemForApi({
      projectId,
      datasetItemId,
      includeMediaReferences: true,
    });

    expect(item.mediaReferences).toEqual([
      {
        field: "input",
        referenceString: media.referenceString,
        jsonPath: "$['image']",
        media: null,
      },
    ]);
  });
});

describe("Dataset item media tRPC procedures", () => {
  const validSha256 = () =>
    crypto.createHash("sha256").update(v4()).digest("base64");

  it("issues a trace-less upload URL and links nothing", async () => {
    const result = await caller.datasets.getItemMediaUploadUrl({
      projectId,
      contentType: MediaContentType.PNG,
      contentLength: 1234,
      sha256Hash: validSha256(),
    });

    expect(result.mediaId).toBeDefined();
    expect(result.uploadUrl).toBeDefined();
    await expect(
      prisma.traceMedia.count({
        where: { projectId, mediaId: result.mediaId },
      }),
    ).resolves.toBe(0);
  });

  it("rejects uploads above the media size limit", async () => {
    await expect(
      caller.datasets.getItemMediaUploadUrl({
        projectId,
        contentType: MediaContentType.PNG,
        contentLength: env.LANGFUSE_S3_MEDIA_MAX_CONTENT_LENGTH + 1,
        sha256Hash: validSha256(),
      }),
    ).rejects.toThrow(/File size must be less than/);
  });

  it("marks a dataset media upload complete", async () => {
    const { mediaId } = await caller.datasets.getItemMediaUploadUrl({
      projectId,
      contentType: MediaContentType.PNG,
      contentLength: 1234,
      sha256Hash: validSha256(),
    });

    await caller.datasets.markItemMediaUploadComplete({
      projectId,
      mediaId,
      uploadedAt: new Date(),
      uploadHttpStatus: 200,
    });

    const media = await prisma.media.findUnique({
      where: { projectId_id: { projectId, id: mediaId } },
    });
    expect(media?.uploadHttpStatus).toBe(200);
  });

  it("allows idempotent successful upload completion", async () => {
    const { mediaId } = await caller.datasets.getItemMediaUploadUrl({
      projectId,
      contentType: MediaContentType.PNG,
      contentLength: 1234,
      sha256Hash: validSha256(),
    });
    await caller.datasets.markItemMediaUploadComplete({
      projectId,
      mediaId,
      uploadedAt: new Date(),
      uploadHttpStatus: 200,
    });

    await expect(
      caller.datasets.markItemMediaUploadComplete({
        projectId,
        mediaId,
        uploadedAt: new Date(),
        uploadHttpStatus: 200,
      }),
    ).resolves.toEqual({ success: true });

    const media = await prisma.media.findUnique({
      where: { projectId_id: { projectId, id: mediaId } },
    });
    expect(media?.uploadHttpStatus).toBe(200);
  });

  // datasets:CUD must not be usable to overwrite an already-successful upload
  // (e.g. flip a trace media reference to a failed status).
  it("rejects marking an already-completed upload", async () => {
    const { mediaId } = await caller.datasets.getItemMediaUploadUrl({
      projectId,
      contentType: MediaContentType.PNG,
      contentLength: 1234,
      sha256Hash: validSha256(),
    });
    await caller.datasets.markItemMediaUploadComplete({
      projectId,
      mediaId,
      uploadedAt: new Date(),
      uploadHttpStatus: 200,
    });

    await expect(
      caller.datasets.markItemMediaUploadComplete({
        projectId,
        mediaId,
        uploadedAt: new Date(),
        uploadHttpStatus: 500,
        uploadHttpError: "tampering",
      }),
    ).rejects.toThrow(/already has a completed upload/);

    const media = await prisma.media.findUnique({
      where: { projectId_id: { projectId, id: mediaId } },
    });
    expect(media?.uploadHttpStatus).toBe(200);
  });

  it("resolves a saved dataset item's media from the table", async () => {
    const media = await createMediaRow();
    const { datasetItemId } = await createDatasetWithItem({
      image: media.referenceString,
    });

    const references = await caller.datasets.itemMediaByItemId({
      projectId,
      datasetItemId,
    });

    expect(references).toEqual([
      expect.objectContaining({
        field: "input",
        jsonPath: "$['image']",
        media: expect.objectContaining({ mediaId: media.mediaId }),
      }),
    ]);
  });

  it("resolves saved media for the exact viewed version", async () => {
    const oldMedia = await createMediaRow();
    const newMedia = await createMediaRow();
    const dataset = await prisma.dataset.create({
      data: { id: v4(), name: v4(), projectId },
    });
    const datasetItemId = v4();
    const oldValidFrom = new Date("2023-01-01T00:00:00.000Z");
    const newValidFrom = new Date("2023-02-01T00:00:00.000Z");

    // Two versions of the same item, each with its own linked media.
    await prisma.datasetItemMedia.createMany({
      data: [oldValidFrom, newValidFrom].map((validFrom, i) => ({
        projectId,
        datasetId: dataset.id,
        datasetItemId,
        datasetItemValidFrom: validFrom,
        mediaId: i === 0 ? oldMedia.mediaId : newMedia.mediaId,
        field: "input",
        jsonPath: "$['image']",
        referenceString:
          i === 0 ? oldMedia.referenceString : newMedia.referenceString,
      })),
    });

    // The historical version resolves its own media, not the latest.
    await expect(
      caller.datasets.itemMediaByItemId({
        projectId,
        datasetItemId,
        datasetItemValidFrom: oldValidFrom,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        referenceString: oldMedia.referenceString,
        media: expect.objectContaining({ mediaId: oldMedia.mediaId }),
      }),
    ]);

    await expect(
      caller.datasets.itemMediaByItemId({
        projectId,
        datasetItemId,
        datasetItemValidFrom: newValidFrom,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        referenceString: newMedia.referenceString,
        media: expect.objectContaining({ mediaId: newMedia.mediaId }),
      }),
    ]);
  });

  it("links media for items copied by duplicateDataset", async () => {
    const media = await createMediaRow();
    const dataset = await prisma.dataset.create({
      data: { id: v4(), name: v4(), projectId },
    });
    const sourceItem = await createDatasetItem({
      projectId,
      datasetId: dataset.id,
      input: { image: media.referenceString },
    });
    if (!sourceItem.success) throw new Error(sourceItem.message);

    const { id: duplicateDatasetId } = await caller.datasets.duplicateDataset({
      projectId,
      datasetId: dataset.id,
    });

    // The duplicate's item has a fresh id/validFrom; it must own its own
    // dataset_item_media rows so the reference resolves and the media stays
    // retention-protected if the source dataset is later deleted.
    const duplicatedItem = await prisma.datasetItem.findFirstOrThrow({
      where: { projectId, datasetId: duplicateDatasetId },
    });
    expect(duplicatedItem.id).not.toBe(sourceItem.datasetItem.id);

    await expect(
      caller.datasets.itemMediaByItemId({
        projectId,
        datasetItemId: duplicatedItem.id,
        datasetItemValidFrom: duplicatedItem.validFrom,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        field: "input",
        jsonPath: "$['image']",
        referenceString: media.referenceString,
        media: expect.objectContaining({ mediaId: media.mediaId }),
      }),
    ]);
  });
});
