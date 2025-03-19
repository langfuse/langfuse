import { expect, test, describe, beforeAll } from "vitest";
import { env } from "../env";
import { randomUUID } from "crypto";
import {
  StorageService,
  StorageServiceFactory,
} from "@langfuse/shared/src/server";

describe("StorageService", () => {
  let storageService: StorageService;
  let storageServiceWithExternalEndpoint: StorageService;
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

  test("uploadFile should upload a file and return a signed URL", async () => {
    // Setup
    const fileName = `${randomUUID()}.txt`;
    const fileType = "text/plain";
    const data = "Hello, world!";
    const expiresInSeconds = 3600;

    // When
    const result = await storageService.uploadFile({
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
    const fileName = `${randomUUID()}.json`;
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
    const fileName1 = `${randomUUID()}.txt`;
    const fileName2 = `${randomUUID()}.txt`;
    await storageService.uploadJson(fileName1, [{ hello: "world" }]);
    await storageService.uploadJson(fileName2, [{ hello: "world" }]);

    // When
    const files = await storageService.listFiles("");

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
    const files = await storageService.listFiles("");
    const fileNames = files.map((f) => f.file);
    expect(fileNames).not.toContain(fileName1);
  });

  test("getSignedUrl should return URL with internal endpoint when no external endpoint is configured", async () => {
    // Setup
    const fileName = `${randomUUID()}.txt`;
    const fileType = "text/plain";
    const data = "Hello, world!";
    const expiresInSeconds = 3600;

    // Upload a file
    await storageService.uploadFile({
      fileName,
      fileType,
      data,
      expiresInSeconds,
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
    const fileName = `${randomUUID()}.txt`;
    const fileType = "text/plain";
    const data = "Hello, world!";
    const expiresInSeconds = 3600;

    // Upload a file
    await storageServiceWithExternalEndpoint.uploadFile({
      fileName,
      fileType,
      data,
      expiresInSeconds,
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

  test("uploadFile should return signed URL with external endpoint when configured", async () => {
    // Setup
    const fileName = `${randomUUID()}.txt`;
    const fileType = "text/plain";
    const data = "Hello, external world!";
    const expiresInSeconds = 3600;

    // When
    const result = await storageServiceWithExternalEndpoint.uploadFile({
      fileName,
      fileType,
      data,
      expiresInSeconds,
    });

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
