import crypto from "crypto";
import fs from "fs";
import path from "path";
import { z } from "zod/v4";

import { makeZodVerifiedAPICallSilent } from "@/src/__tests__/test-utils";
import { env } from "@/src/env.mjs";
import {
  type GetMediaResponse,
  GetMediaResponseSchema,
  type GetMediaUploadUrlResponse,
  GetMediaUploadUrlResponseSchema,
} from "@/src/features/media/validation";
import {
  type Media,
  type ObservationMedia,
  prisma,
  type TraceMedia,
} from "@langfuse/shared/src/db";
import { redis } from "@langfuse/shared/src/server";

describe("Media Upload API", () => {
  const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";
  const staticFixtureDir = path.join(__dirname, "..", "static");
  const isAzureBlobMode =
    process.env.LANGFUSE_USE_AZURE_BLOB === "true" ||
    env.LANGFUSE_S3_MEDIA_UPLOAD_ACCESS_KEY_ID === "devstoreaccount1" ||
    env.LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT?.includes(":10000/") === true;
  const describeIfNotAzureBlobStorage = isAzureBlobMode
    ? describe.skip
    : describe;

  // Read the image file once and reuse it for all tests
  const imagePathPNG = path.join(staticFixtureDir, "langfuse-logo.png");
  const fileBytesPNG = fs.readFileSync(imagePathPNG);
  const contentTypePNG = "image/png";
  const contentLengthPNG = fileBytesPNG.length;
  const sha256HashPNG = crypto
    .createHash("sha256")
    .update(fileBytesPNG)
    .digest("base64");

  const validPNG = {
    contentType: contentTypePNG,
    contentLength: contentLengthPNG,
    sha256Hash: sha256HashPNG,
    fileBytes: fileBytesPNG,
  };

  // Read the PDF file once and reuse it for all tests
  const imagePathPDF = path.join(staticFixtureDir, "bitcoin.pdf");
  const fileBytesPDF = fs.readFileSync(imagePathPDF);
  const contentTypePDF = "application/pdf";
  const contentLengthPDF = fileBytesPDF.length;
  const sha256HashPDF = crypto
    .createHash("sha256")
    .update(fileBytesPDF)
    .digest("base64");

  const validPDF = {
    contentType: contentTypePDF,
    contentLength: contentLengthPDF,
    sha256Hash: sha256HashPDF,
    fileBytes: fileBytesPDF,
  };

  // Run the upload end-to-end test for a given set of media data
  async function runMediaUploadEndToEndTest({
    contentType,
    contentLength,
    traceId,
    observationId,
    field,
    sha256Hash,
    fileBytes,
    claimedContentType,
    claimedContentLength,
    claimedSha256Hash,
  }: {
    contentType: string;
    contentLength: number;
    traceId: string;
    observationId?: string;
    field: string;
    sha256Hash: string;
    fileBytes: Uint8Array;
    claimedContentType?: string;
    claimedContentLength?: number;
    claimedSha256Hash?: string;
  }) {
    const basePath = "api/public/media";
    const result: {
      getUploadUrlResponse: HttpResponse<GetMediaUploadUrlResponse> | null;
      uploadFileResponse: Response | null;
      updateMediaResponse: HttpResponse<void> | null;
      getDownloadUrlResponse: HttpResponse<GetMediaResponse> | null;
      fetchMediaAssetResponse: Response | null;
      mediaRecord: Media | null;
      traceMediaRecord: TraceMedia | null;
      observationMediaRecord: ObservationMedia | null;
    } = {
      getUploadUrlResponse: null,
      uploadFileResponse: null,
      updateMediaResponse: null,
      getDownloadUrlResponse: null,
      fetchMediaAssetResponse: null,
      mediaRecord: null,
      traceMediaRecord: null,
      observationMediaRecord: null,
    };
    let mediaId: string | null = null;

    try {
      // Get upload URL
      const getUploadUrlResponse = await makeZodVerifiedAPICallSilent(
        GetMediaUploadUrlResponseSchema,
        "POST",
        basePath,
        {
          contentType: claimedContentType ?? contentType,
          contentLength: claimedContentLength ?? contentLength,
          traceId,
          observationId,
          field,
          sha256Hash: claimedSha256Hash ?? sha256Hash,
        },
      );
      result.getUploadUrlResponse = getUploadUrlResponse;

      if (!getUploadUrlResponse.body.uploadUrl) {
        return result;
      }

      mediaId = getUploadUrlResponse.body.mediaId;

      // Upload file
      const uploadFileResponse = await fetch(
        getUploadUrlResponse.body.uploadUrl,
        {
          method: "PUT",
          body: fileBytes,
          headers: {
            "Content-Type": contentType,
            "X-Amz-Checksum-Sha256": sha256Hash,
          },
        },
      ).catch((err) => console.error(err));

      result.uploadFileResponse = uploadFileResponse
        ? uploadFileResponse
        : null;

      if (!uploadFileResponse) {
        return result;
      }

      // Update media record
      const updateMediaResponse = await makeZodVerifiedAPICallSilent(
        z.any(),
        "PATCH",
        basePath + `/${mediaId}`,
        {
          uploadedAt: new Date().toISOString(),
          uploadHttpStatus: uploadFileResponse.status,
          uploadHttpError: await uploadFileResponse.text(),
        },
      );
      result.updateMediaResponse = updateMediaResponse;

      // Get download URL
      const getDownloadUrlResponse = await makeZodVerifiedAPICallSilent(
        GetMediaResponseSchema,
        "GET",
        basePath + `/${mediaId}`,
      );
      result.getDownloadUrlResponse = getDownloadUrlResponse;

      if (
        !(
          getDownloadUrlResponse.status === 200 ||
          getDownloadUrlResponse.status === 201
        )
      ) {
        return result;
      }

      const fetchMediaAssetResponse = await fetch(
        getDownloadUrlResponse.body.url,
      );

      result.fetchMediaAssetResponse = fetchMediaAssetResponse;
    } catch (error) {
      console.error(error);
      return result;
    } finally {
      if (mediaId) {
        result.mediaRecord = await prisma.media.findUnique({
          where: { projectId_id: { id: mediaId, projectId } },
        });
        result.traceMediaRecord = await prisma.traceMedia.findUnique({
          where: {
            projectId_traceId_mediaId_field: {
              projectId,
              traceId,
              mediaId,
              field,
            },
          },
        });
        result.observationMediaRecord = observationId
          ? await prisma.observationMedia.findUnique({
              where: {
                projectId_traceId_observationId_mediaId_field: {
                  projectId,
                  traceId,
                  observationId,
                  mediaId,
                  field,
                },
              },
            })
          : null;
      }
      return result;
    }
  }

  beforeEach(async () => {
    if (!env.DATABASE_URL.includes("localhost:5432")) {
      throw new Error("You cannot prune database unless running on localhost.");
    }

    await prisma.media.deleteMany();
  });

  afterAll(async () => {
    if (redis) {
      redis.disconnect();
    }
  });

  describeIfNotAzureBlobStorage("End-to-end tests", () => {
    it("should upload and retrieve a PNG media asset for trace input", async () => {
      const traceId = "test";
      const field = "input";

      const result = await runMediaUploadEndToEndTest({
        ...validPNG,
        traceId,
        field,
      });

      expect(result.getUploadUrlResponse?.status).toBe(201);
      expect(result.updateMediaResponse?.status).toBe(200);
      expect(result.getDownloadUrlResponse?.status).toBe(200);
      expect(result.uploadFileResponse?.status).toBe(200);
      expect(result.mediaRecord).not.toBeNull();
      expect(result.mediaRecord).toMatchObject({
        sha256Hash: validPNG.sha256Hash,
        contentType: validPNG.contentType,
        contentLength: BigInt(validPNG.contentLength),
        bucketName: env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET,
        bucketPath: expect.any(String),
        uploadHttpStatus: 200,
        uploadHttpError: null,
      });
      expect(result.traceMediaRecord).not.toBeNull();
      expect(result.traceMediaRecord).toMatchObject({
        projectId,
        traceId,
        mediaId: result.mediaRecord?.id,
        field,
      });
      expect(result.observationMediaRecord).toBeNull();
      expect(result.fetchMediaAssetResponse?.status).toBe(200);
      expect(result.fetchMediaAssetResponse?.headers.get("content-type")).toBe(
        validPNG.contentType,
      );
      expect(
        result.fetchMediaAssetResponse?.headers.get("content-length"),
      ).toBe(validPNG.contentLength.toString());

      const responseBuffer =
        await result.fetchMediaAssetResponse?.arrayBuffer();
      if (!responseBuffer) {
        throw new Error("Response buffer is undefined");
      }
      const responseHash = crypto
        .createHash("sha256")
        .update(Buffer.from(responseBuffer))
        .digest("base64");
      expect(responseHash).toEqual(validPNG.sha256Hash);
    }, 10_000);

    it("should upload and retrieve a PDF media asset for observation output", async () => {
      const traceId = "test";
      const observationId = "test";
      const field = "output";

      const result = await runMediaUploadEndToEndTest({
        ...validPDF,
        traceId,
        observationId,
        field,
      });

      expect(result.getUploadUrlResponse?.status).toBe(201);
      expect(result.updateMediaResponse?.status).toBe(200);
      expect(result.getDownloadUrlResponse?.status).toBe(200);
      expect(result.uploadFileResponse?.status).toBe(200);
      expect(result.mediaRecord).not.toBeNull();
      expect(result.mediaRecord).toMatchObject({
        sha256Hash: validPDF.sha256Hash,
        contentType: validPDF.contentType,
        contentLength: BigInt(validPDF.contentLength),
        bucketName: env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET,
        bucketPath: expect.any(String),
      });
      expect(result.traceMediaRecord).toBeNull();
      expect(result.observationMediaRecord).not.toBeNull();
      expect(result.observationMediaRecord).toMatchObject({
        projectId,
        observationId,
        mediaId: result.mediaRecord?.id,
        field,
      });
      expect(result.fetchMediaAssetResponse?.status).toBe(200);
      expect(result.fetchMediaAssetResponse?.headers.get("content-type")).toBe(
        validPDF.contentType,
      );
      expect(
        result.fetchMediaAssetResponse?.headers.get("content-length"),
      ).toBe(validPDF.contentLength.toString());

      const responseBuffer =
        await result.fetchMediaAssetResponse?.arrayBuffer();
      if (!responseBuffer) {
        throw new Error("Response buffer is undefined");
      }
      const responseHash = crypto
        .createHash("sha256")
        .update(Buffer.from(responseBuffer))
        .digest("base64");
      expect(responseHash).toEqual(validPDF.sha256Hash);
    }, 10_000);

    it("should allow retrying with correct content length", async () => {
      const traceId = "test";
      const field = "input";

      const failedResult = await runMediaUploadEndToEndTest({
        ...validPNG,
        traceId,
        field,
        claimedContentLength: 100,
      });

      expect(failedResult.getUploadUrlResponse?.status).toBe(201);
      expect(failedResult.updateMediaResponse?.status).toBe(200);
      expect(failedResult.uploadFileResponse?.status).toBe(403);
      expect(failedResult.getDownloadUrlResponse?.status).toBe(404);
      expect(failedResult.mediaRecord).not.toBeNull();
      expect(failedResult.mediaRecord).toMatchObject({
        sha256Hash: validPNG.sha256Hash,
        contentType: validPNG.contentType,
        contentLength: BigInt(100),
        bucketName: env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET,
        bucketPath: expect.any(String),
        uploadHttpStatus: 403,
        uploadHttpError: expect.any(String),
      });
      expect(failedResult.traceMediaRecord).not.toBeNull();
      expect(failedResult.traceMediaRecord).toMatchObject({
        projectId,
        traceId,
        mediaId: failedResult.mediaRecord?.id,
        field,
      });
      expect(failedResult.observationMediaRecord).toBeNull();
      expect(failedResult.fetchMediaAssetResponse).toBeNull();

      const result = await runMediaUploadEndToEndTest({
        ...validPNG,
        traceId,
        field,
      });

      expect(result.getUploadUrlResponse?.status).toBe(201);
      expect(result.updateMediaResponse?.status).toBe(200);
      expect(result.getDownloadUrlResponse?.status).toBe(200);
      expect(result.uploadFileResponse?.status).toBe(200);
      expect(result.mediaRecord).not.toBeNull();
      expect(result.mediaRecord).toMatchObject({
        sha256Hash: validPNG.sha256Hash,
        contentType: validPNG.contentType,
        contentLength: BigInt(validPNG.contentLength),
        bucketName: env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET,
        bucketPath: expect.any(String),
        uploadHttpStatus: 200,
        uploadHttpError: null,
      });
      expect(result.traceMediaRecord).not.toBeNull();
      expect(result.traceMediaRecord).toMatchObject({
        projectId,
        traceId,
        mediaId: result.mediaRecord?.id,
        field,
      });
      expect(result.observationMediaRecord).toBeNull();
      expect(result.fetchMediaAssetResponse?.status).toBe(200);
      expect(result.fetchMediaAssetResponse?.headers.get("content-type")).toBe(
        validPNG.contentType,
      );
      expect(
        result.fetchMediaAssetResponse?.headers.get("content-length"),
      ).toBe(validPNG.contentLength.toString());

      const responseBuffer =
        await result.fetchMediaAssetResponse?.arrayBuffer();
      if (!responseBuffer) {
        throw new Error("Response buffer is undefined");
      }
      const responseHash = crypto
        .createHash("sha256")
        .update(Buffer.from(responseBuffer))
        .digest("base64");
      expect(responseHash).toEqual(validPNG.sha256Hash);
    }, 10_000);

    it("should allow retrying with correct content bytes", async () => {
      const traceId = "test";
      const field = "input";

      const failedResult = await runMediaUploadEndToEndTest({
        ...validPNG,
        traceId,
        field,
        fileBytes: new Uint8Array([1, 2, 3]),
      });

      expect(failedResult.getUploadUrlResponse?.status).toBe(201);
      expect(failedResult.uploadFileResponse?.status).toBe(403);
      expect(failedResult.updateMediaResponse?.status).toBe(200);
      expect(failedResult.getDownloadUrlResponse?.status).toBe(404);
      expect(failedResult.mediaRecord).not.toBeNull();
      expect(failedResult.mediaRecord).toMatchObject({
        sha256Hash: validPNG.sha256Hash,
        contentType: validPNG.contentType,
        contentLength: BigInt(validPNG.contentLength),
        bucketName: env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET,
        bucketPath: expect.any(String),
        uploadHttpStatus: 403,
        uploadHttpError: expect.any(String),
      });
      expect(failedResult.traceMediaRecord).not.toBeNull();
      expect(failedResult.traceMediaRecord).toMatchObject({
        projectId,
        traceId,
        mediaId: failedResult.mediaRecord?.id,
        field,
      });
      expect(failedResult.observationMediaRecord).toBeNull();
      expect(failedResult.fetchMediaAssetResponse).toBeNull();

      const result = await runMediaUploadEndToEndTest({
        ...validPNG,
        traceId,
        field,
      });

      expect(result.getUploadUrlResponse?.status).toBe(201);
      expect(result.updateMediaResponse?.status).toBe(200);
      expect(result.getDownloadUrlResponse?.status).toBe(200);
      expect(result.uploadFileResponse?.status).toBe(200);
      expect(result.mediaRecord).not.toBeNull();
      expect(result.mediaRecord).toMatchObject({
        sha256Hash: validPNG.sha256Hash,
        contentType: validPNG.contentType,
        contentLength: BigInt(validPNG.contentLength),
        bucketName: env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET,
        bucketPath: expect.any(String),
        uploadHttpStatus: 200,
        uploadHttpError: null,
      });
      expect(result.traceMediaRecord).not.toBeNull();
      expect(result.traceMediaRecord).toMatchObject({
        projectId,
        traceId,
        mediaId: result.mediaRecord?.id,
        field,
      });
      expect(result.observationMediaRecord).toBeNull();
      expect(result.fetchMediaAssetResponse?.status).toBe(200);
      expect(result.fetchMediaAssetResponse?.headers.get("content-type")).toBe(
        validPNG.contentType,
      );
      expect(
        result.fetchMediaAssetResponse?.headers.get("content-length"),
      ).toBe(validPNG.contentLength.toString());

      const responseBuffer =
        await result.fetchMediaAssetResponse?.arrayBuffer();
      if (!responseBuffer) {
        throw new Error("Response buffer is undefined");
      }
      const responseHash = crypto
        .createHash("sha256")
        .update(Buffer.from(responseBuffer))
        .digest("base64");
      expect(responseHash).toEqual(validPNG.sha256Hash);
    }, 10_000);

    it("should allow retrying with correct content type", async () => {
      const traceId = "test";
      const field = "input";

      const failedResult = await runMediaUploadEndToEndTest({
        ...validPNG,
        traceId,
        field,
        claimedContentType: "image/jpeg",
      });

      expect(failedResult.getUploadUrlResponse?.status).toBe(201);
      expect(failedResult.updateMediaResponse?.status).toBe(200);
      expect(failedResult.uploadFileResponse?.status).toBe(403);
      expect(failedResult.getDownloadUrlResponse?.status).toBe(404);
      expect(failedResult.mediaRecord).not.toBeNull();
      expect(failedResult.mediaRecord).toMatchObject({
        sha256Hash: validPNG.sha256Hash,
        contentType: "image/jpeg",
        contentLength: BigInt(validPNG.contentLength),
        bucketName: env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET,
        bucketPath: expect.any(String),
        uploadHttpStatus: 403,
        uploadHttpError: expect.any(String),
      });
      expect(failedResult.traceMediaRecord).not.toBeNull();
      expect(failedResult.traceMediaRecord).toMatchObject({
        projectId,
        traceId,
        mediaId: failedResult.mediaRecord?.id,
        field,
      });
      expect(failedResult.observationMediaRecord).toBeNull();
      expect(failedResult.fetchMediaAssetResponse).toBeNull();

      const result = await runMediaUploadEndToEndTest({
        ...validPNG,
        traceId,
        field,
      });

      expect(result.getUploadUrlResponse?.status).toBe(201);
      expect(result.updateMediaResponse?.status).toBe(200);
      expect(result.getDownloadUrlResponse?.status).toBe(200);
      expect(result.uploadFileResponse?.status).toBe(200);
      expect(result.mediaRecord).not.toBeNull();
      expect(result.mediaRecord).toMatchObject({
        sha256Hash: validPNG.sha256Hash,
        contentType: validPNG.contentType,
        contentLength: BigInt(validPNG.contentLength),
        bucketName: env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET,
        bucketPath: expect.any(String),
        uploadHttpStatus: 200,
        uploadHttpError: null,
      });
      expect(result.traceMediaRecord).not.toBeNull();
      expect(result.traceMediaRecord).toMatchObject({
        projectId,
        traceId,
        mediaId: result.mediaRecord?.id,
        field,
      });
      expect(result.observationMediaRecord).toBeNull();
      expect(result.fetchMediaAssetResponse?.status).toBe(200);
      expect(result.fetchMediaAssetResponse?.headers.get("content-type")).toBe(
        validPNG.contentType,
      );
      expect(
        result.fetchMediaAssetResponse?.headers.get("content-length"),
      ).toBe(validPNG.contentLength.toString());

      const responseBuffer =
        await result.fetchMediaAssetResponse?.arrayBuffer();
      if (!responseBuffer) {
        throw new Error("Response buffer is undefined");
      }
      const responseHash = crypto
        .createHash("sha256")
        .update(Buffer.from(responseBuffer))
        .digest("base64");
      expect(responseHash).toEqual(validPNG.sha256Hash);
    }, 10_000);

    it("should allow reuploading with different content type", async () => {
      const traceId = "test";
      const field = "input";

      const firstResult = await runMediaUploadEndToEndTest({
        ...validPNG,
        traceId,
        field,
        contentType: "image/jpeg",
      });

      expect(firstResult.getUploadUrlResponse?.status).toBe(201);
      expect(firstResult.updateMediaResponse?.status).toBe(200);
      expect(firstResult.getDownloadUrlResponse?.status).toBe(200);
      expect(firstResult.uploadFileResponse?.status).toBe(200);
      expect(firstResult.mediaRecord).not.toBeNull();
      expect(firstResult.mediaRecord).toMatchObject({
        sha256Hash: validPNG.sha256Hash,
        contentType: "image/jpeg",
        contentLength: BigInt(validPNG.contentLength),
        bucketName: env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET,
        bucketPath: expect.any(String),
        uploadHttpStatus: 200,
        uploadHttpError: null,
      });
      expect(firstResult.traceMediaRecord).not.toBeNull();
      expect(firstResult.traceMediaRecord).toMatchObject({
        projectId,
        traceId,
        mediaId: firstResult.mediaRecord?.id,
        field,
      });
      expect(firstResult.observationMediaRecord).toBeNull();
      expect(firstResult.fetchMediaAssetResponse?.status).toBe(200);
      expect(
        firstResult.fetchMediaAssetResponse?.headers.get("content-type"),
      ).toBe("image/jpeg");
      expect(
        firstResult.fetchMediaAssetResponse?.headers.get("content-length"),
      ).toBe(validPNG.contentLength.toString());

      const firstResponseBuffer =
        await firstResult.fetchMediaAssetResponse?.arrayBuffer();
      if (!firstResponseBuffer) {
        throw new Error("Response buffer is undefined");
      }
      const firstResponseHash = crypto
        .createHash("sha256")
        .update(Buffer.from(firstResponseBuffer))
        .digest("base64");
      expect(firstResponseHash).toEqual(validPNG.sha256Hash);

      const secondResult = await runMediaUploadEndToEndTest({
        ...validPNG,
        traceId,
        field,
      });

      expect(secondResult.getUploadUrlResponse?.status).toBe(201);
      expect(secondResult.updateMediaResponse?.status).toBe(200);
      expect(secondResult.getDownloadUrlResponse?.status).toBe(200);
      expect(secondResult.uploadFileResponse?.status).toBe(200);
      expect(secondResult.mediaRecord).not.toBeNull();
      expect(secondResult.mediaRecord).toMatchObject({
        sha256Hash: validPNG.sha256Hash,
        contentType: validPNG.contentType,
        contentLength: BigInt(validPNG.contentLength),
        bucketName: env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET,
        bucketPath: expect.any(String),
        uploadHttpStatus: 200,
        uploadHttpError: null,
      });
      expect(secondResult.traceMediaRecord).not.toBeNull();
      expect(secondResult.traceMediaRecord).toMatchObject({
        projectId,
        traceId,
        mediaId: secondResult.mediaRecord?.id,
        field,
      });
      expect(secondResult.observationMediaRecord).toBeNull();
      expect(secondResult.fetchMediaAssetResponse?.status).toBe(200);
      expect(
        secondResult.fetchMediaAssetResponse?.headers.get("content-type"),
      ).toBe(validPNG.contentType);
      expect(
        secondResult.fetchMediaAssetResponse?.headers.get("content-length"),
      ).toBe(validPNG.contentLength.toString());

      const responseBuffer =
        await secondResult.fetchMediaAssetResponse?.arrayBuffer();
      if (!responseBuffer) {
        throw new Error("Response buffer is undefined");
      }
      const responseHash = crypto
        .createHash("sha256")
        .update(Buffer.from(responseBuffer))
        .digest("base64");
      expect(responseHash).toEqual(validPNG.sha256Hash);
    }, 10_000);

    it("should return mediaId without upload URL if media file is already uploaded", async () => {
      const traceId = "test";
      const field = "input";

      const result = await runMediaUploadEndToEndTest({
        ...validPNG,
        traceId,
        field,
      });

      expect(result.getUploadUrlResponse?.status).toBe(201);
      expect(result.updateMediaResponse?.status).toBe(200);
      expect(result.getDownloadUrlResponse?.status).toBe(200);
      expect(result.uploadFileResponse?.status).toBe(200);
      expect(result.mediaRecord).not.toBeNull();
      expect(result.mediaRecord).toMatchObject({
        sha256Hash: validPNG.sha256Hash,
        contentType: validPNG.contentType,
        contentLength: BigInt(validPNG.contentLength),
        bucketName: env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET,
        bucketPath: expect.any(String),
        uploadHttpStatus: 200,
        uploadHttpError: null,
      });
      expect(result.traceMediaRecord).not.toBeNull();
      expect(result.traceMediaRecord).toMatchObject({
        projectId,
        traceId,
        mediaId: result.mediaRecord?.id,
        field,
      });
      expect(result.observationMediaRecord).toBeNull();
      expect(result.fetchMediaAssetResponse?.status).toBe(200);
      expect(result.fetchMediaAssetResponse?.headers.get("content-type")).toBe(
        validPNG.contentType,
      );
      expect(
        result.fetchMediaAssetResponse?.headers.get("content-length"),
      ).toBe(validPNG.contentLength.toString());

      const responseBuffer =
        await result.fetchMediaAssetResponse?.arrayBuffer();
      if (!responseBuffer) {
        throw new Error("Response buffer is undefined");
      }
      const responseHash = crypto
        .createHash("sha256")
        .update(Buffer.from(responseBuffer))
        .digest("base64");
      expect(responseHash).toEqual(validPNG.sha256Hash);

      const secondResult = await runMediaUploadEndToEndTest({
        ...validPNG,
        traceId,
        field,
      });

      expect(secondResult.getUploadUrlResponse?.status).toBe(201);
      expect(secondResult.getUploadUrlResponse?.body.uploadUrl).toBeNull();
      expect(secondResult.getUploadUrlResponse?.body.mediaId).toBeDefined();
    }, 10_000);
  });

  describe("Request Validation", () => {
    it("should reject invalid content types", async () => {
      const traceId = "test";
      const field = "input";

      const result = await runMediaUploadEndToEndTest({
        ...validPNG,
        traceId,
        field,
        contentType: "invalid",
      });

      expect(result.getUploadUrlResponse?.status).toBe(400);
      expect(result.updateMediaResponse).toBeNull();
      expect(result.getDownloadUrlResponse).toBeNull();
      expect(result.uploadFileResponse).toBeNull();
      expect(result.mediaRecord).toBeNull();
      expect(result.traceMediaRecord).toBeNull();
      expect(result.observationMediaRecord).toBeNull();
    }, 10_000);

    it("should reject content length exceeding maximum allowed size", async () => {
      const traceId = "test";
      const field = "input";

      const result = await runMediaUploadEndToEndTest({
        ...validPNG,
        traceId,
        field,
        contentLength: env.LANGFUSE_S3_MEDIA_MAX_CONTENT_LENGTH + 1,
      });

      expect(result.getUploadUrlResponse?.status).toBe(400);
      expect(result.updateMediaResponse).toBeNull();
      expect(result.getDownloadUrlResponse).toBeNull();
      expect(result.uploadFileResponse).toBeNull();
      expect(result.mediaRecord).toBeNull();
      expect(result.traceMediaRecord).toBeNull();
      expect(result.observationMediaRecord).toBeNull();
    }, 10_000);

    it("should reject invalid SHA-256 hash format", async () => {
      const traceId = "test";
      const field = "input";

      const result = await runMediaUploadEndToEndTest({
        ...validPNG,
        traceId,
        field,
        sha256Hash: "invalid-hash-that-is-not-base64", // Not base64 encoded
      });

      expect(result.getUploadUrlResponse?.status).toBe(400);
      expect(result.updateMediaResponse).toBeNull();
      expect(result.getDownloadUrlResponse).toBeNull();
      expect(result.uploadFileResponse).toBeNull();
      expect(result.mediaRecord).toBeNull();
      expect(result.traceMediaRecord).toBeNull();
      expect(result.observationMediaRecord).toBeNull();
    }, 10_000);
  });

  describeIfNotAzureBlobStorage("Upload Integrity", () => {
    it("should detect SHA-256 hash mismatch during upload", async () => {
      const traceId = "test";
      const field = "input";

      // Create a modified copy of the PNG file bytes by changing a single byte
      const modifiedFileBytes = Buffer.from(validPNG.fileBytes);
      modifiedFileBytes[0] = modifiedFileBytes[0] ^ 0xff; // Flip bits of first byte

      const result = await runMediaUploadEndToEndTest({
        ...validPNG,
        traceId,
        field,
        fileBytes: modifiedFileBytes, // Use modified bytes but keep original hash
      });

      expect(result.getUploadUrlResponse?.status).toBe(201);
      expect(result.uploadFileResponse?.status).toBe(400); // S3 should reject due to checksum mismatch
      expect(result.updateMediaResponse?.status).toBe(200);
      expect(result.getDownloadUrlResponse?.status).toBe(404);
      expect(result.mediaRecord).not.toBeNull();
      expect(result.mediaRecord?.uploadHttpStatus).toBe(400);
      expect(result.mediaRecord?.uploadHttpError).toContain("ChecksumMismatch");
      expect(result.traceMediaRecord).toMatchObject({
        projectId,
        traceId,
        mediaId: result.mediaRecord?.id,
        field,
      });
      expect(result.observationMediaRecord).toBeNull();
    }, 10_000);
  });
});

type HttpResponse<T> = {
  body: T;
  status: number;
};
