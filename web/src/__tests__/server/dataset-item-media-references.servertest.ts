import crypto from "crypto";

import {
  getDatasetItemForApi,
  listDatasetItemsForApi,
} from "@/src/features/datasets/server/publicDatasetService";
import {
  GetDatasetItemsV1Response,
  GetDatasetItemV1Response,
} from "@/src/features/public-api/types/datasets";
import { prisma } from "@langfuse/shared/src/db";
import { createDatasetItem } from "@langfuse/shared/src/server";
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
        field: "expected_output",
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
          contentType: "image/png",
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
