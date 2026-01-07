import {
  expect,
  test,
  describe,
  beforeAll,
  beforeEach,
  afterEach,
} from "vitest";
import { env } from "../env";
import { randomUUID } from "crypto";
import {
  StorageService,
  StorageServiceFactory,
} from "@langfuse/shared/src/server";

const { Readable } = require("stream");

describe("StorageService", () => {
  let storageService: StorageService;
  let storageServiceWithExternalEndpoint: StorageService;
  let s3Prefix: string;
  const baseUrl = `${env.LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT}/${env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET}`;
  const externalEndpoint = "https://external-endpoint.example.com";

  beforeAll(() => {
    storageService = StorageServiceFactory.getInstance({
      accessKeyId: env.LANGFUSE_S3_EVENT_UPLOAD_ACCESS_KEY_ID,
      secretAccessKey: env.LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY,
      bucketName: env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
      endpoint: env.LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT,
      region: env.LANGFUSE_S3_EVENT_UPLOAD_REGION,
      forcePathStyle: env.LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE === "true",
    });

    storageServiceWithExternalEndpoint = StorageServiceFactory.getInstance({
      accessKeyId: env.LANGFUSE_S3_EVENT_UPLOAD_ACCESS_KEY_ID,
      secretAccessKey: env.LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY,
      bucketName: env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
      endpoint: env.LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT,
      externalEndpoint,
      region: env.LANGFUSE_S3_EVENT_UPLOAD_REGION,
      forcePathStyle: env.LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE === "true",
    });
  });

  beforeEach(() => {
    s3Prefix = `${randomUUID()}/`;
  });

  afterEach(async () => {
    const files = await storageService.listFiles(s3Prefix);

    if (files.length == 0) return;

    await storageService.deleteFiles(files.map((f) => f.file));
  });

  test("uploadWithSignedUrl should upload a file and return a signed URL", async () => {
    // Setup
    const fileName = `${s3Prefix}${randomUUID()}.txt`;
    const fileType = "text/plain";
    const data = "Hello, world!";
    const expiresInSeconds = 3600;

    // When
    const result = await storageService.uploadWithSignedUrl({
      fileName,
      fileType,
      data,
      expiresInSeconds,
    });

    // Then
    expect(result.signedUrl).toContain(`${baseUrl}/${fileName}`);
    const file = await storageService.download(fileName);
    expect(file).toBe(data);
  });

  test("uploadJson should upload a JSON file", async () => {
    // Setup
    const fileName = `${s3Prefix}${randomUUID()}.json`;
    const data = [{ hello: "world" }];
    const expiresInSeconds = 3600;

    // When
    await storageService.uploadJson(fileName, data);

    // Then
    const file = await storageService.download(fileName);
    expect(JSON.parse(file)).toEqual(data);
  });

  test("listFiles should list files in the bucket", async () => {
    // Setup
    const fileName1 = `${s3Prefix}${randomUUID()}.txt`;
    const fileName2 = `${s3Prefix}${randomUUID()}.txt`;
    await storageService.uploadJson(fileName1, [{ hello: "world" }]);
    await storageService.uploadJson(fileName2, [{ hello: "world" }]);

    // When
    const files = await storageService.listFiles(s3Prefix);

    // Then
    const fileNames = files.map((f) => f.file);
    expect(fileNames).toContain(fileName1);
    expect(fileNames).toContain(fileName2);
  });

  test("deleteFiles should delete a file", async () => {
    // Setup
    const fileName1 = `${randomUUID()}.txt`;
    const fileName2 = `${randomUUID()}.txt`;
    await storageService.uploadJson(fileName1, [{ hello: "world" }]);
    await storageService.uploadJson(fileName2, [{ hello: "world" }]);

    // When
    await storageService.deleteFiles([fileName1]);

    // Then
    const files = await storageService.listFiles(s3Prefix);
    const fileNames = files.map((f) => f.file);
    expect(fileNames).not.toContain(fileName1);
  });

  test("uploadFile should successfully process a Readable entity", async () => {
    // Setup
    const fileName = `${s3Prefix}${randomUUID()}.txt`;
    const fileType = "text/plain";
    const data = "Hello, world!";
    const expiresInSeconds = 3600;

    // Upload a file
    await storageService.uploadFile({
      fileName,
      fileType,
      data: Readable.from(data),
    });

    // When
    const signedUrl = await storageService.getSignedUrl(
      fileName,
      expiresInSeconds,
    );

    // Then
    expect(signedUrl).toContain(env.LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT);
    expect(signedUrl).not.toContain("external-endpoint.example.com");
  });

  test("getSignedUrl should return URL with internal endpoint when no external endpoint is configured", async () => {
    // Setup
    const fileName = `${s3Prefix}${randomUUID()}.txt`;
    const fileType = "text/plain";
    const data = "Hello, world!";
    const expiresInSeconds = 3600;

    // Upload a file
    await storageService.uploadFile({
      fileName,
      fileType,
      data,
    });

    // When
    const signedUrl = await storageService.getSignedUrl(
      fileName,
      expiresInSeconds,
    );

    // Then
    expect(signedUrl).toContain(env.LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT);
    expect(signedUrl).not.toContain("external-endpoint.example.com");
  });

  test("getSignedUrl should return URL with external endpoint when configured", async () => {
    // Setup
    const fileName = `${s3Prefix}${randomUUID()}.txt`;
    const fileType = "text/plain";
    const data = "Hello, world!";
    const expiresInSeconds = 3600;

    // Upload a file
    await storageServiceWithExternalEndpoint.uploadFile({
      fileName,
      fileType,
      data,
    });

    // When
    const signedUrl = await storageServiceWithExternalEndpoint.getSignedUrl(
      fileName,
      expiresInSeconds,
    );

    // Then
    expect(signedUrl).toContain("external-endpoint.example.com");
    expect(signedUrl).not.toContain(env.LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT);
  });

  test("getSignedUploadUrl should return URL with internal endpoint when no external endpoint is configured", async () => {
    // Setup
    const path = `${randomUUID()}.txt`;
    const ttlSeconds = 3600;
    const sha256Hash = "dummy-hash";
    const contentType = "text/plain";
    const contentLength = 100;

    // When
    const signedUrl = await storageService.getSignedUploadUrl({
      path,
      ttlSeconds,
      sha256Hash,
      contentType,
      contentLength,
    });

    // Then
    expect(signedUrl).toContain(env.LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT);
    expect(signedUrl).not.toContain("external-endpoint.example.com");
  });

  test("getSignedUploadUrl should return URL with external endpoint when configured", async () => {
    // Setup
    const path = `${randomUUID()}.txt`;
    const ttlSeconds = 3600;
    const sha256Hash = "dummy-hash";
    const contentType = "text/plain";
    const contentLength = 100;

    // When
    const signedUrl =
      await storageServiceWithExternalEndpoint.getSignedUploadUrl({
        path,
        ttlSeconds,
        sha256Hash,
        contentType,
        contentLength,
      });

    // Then
    expect(signedUrl).toContain("external-endpoint.example.com");
    expect(signedUrl).not.toContain(env.LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT);
  });

  test("uploadWithSignedUrl should return signed URL with external endpoint when configured", async () => {
    // Setup
    const fileName = `${s3Prefix}${randomUUID()}.txt`;
    const fileType = "text/plain";
    const data = "Hello, external world!";
    const expiresInSeconds = 3600;

    // When
    const result = await storageServiceWithExternalEndpoint.uploadWithSignedUrl(
      {
        fileName,
        fileType,
        data,
        expiresInSeconds,
      },
    );

    // Then
    expect(result.signedUrl).toContain("external-endpoint.example.com");
    expect(result.signedUrl).not.toContain(
      env.LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT,
    );

    // Verify the file was uploaded correctly
    const file = await storageService.download(fileName);
    expect(file).toBe(data);
  });
});
