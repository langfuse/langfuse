import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  resolveLocalStoragePath,
  StorageService,
  StorageServiceFactory,
} from "@langfuse/shared/src/server";

describe("LocalFileStorageService", () => {
  let localPath: string;
  let localStorageService: StorageService;

  beforeEach(async () => {
    localPath = await mkdtemp(path.join(os.tmpdir(), "langfuse-media-"));
    localStorageService = StorageServiceFactory.getInstance({
      accessKeyId: undefined,
      secretAccessKey: undefined,
      bucketName: "local",
      endpoint: undefined,
      region: undefined,
      forcePathStyle: false,
      awsSse: undefined,
      awsSseKmsKeyId: undefined,
      useLocalFileStorage: true,
      localFileStoragePath: localPath,
    });
  });

  afterEach(async () => {
    await rm(localPath, { recursive: true, force: true });
  });

  test("uploads, lists, downloads, and deletes files under the configured path", async () => {
    const fileName = `${randomUUID()}/hello.txt`;
    await localStorageService.uploadFile({
      fileName,
      fileType: "text/plain",
      data: "Hello, local storage!",
    });

    const files = await localStorageService.listFiles(fileName.split("/")[0]);
    expect(files.map((f) => f.file)).toEqual([fileName]);
    await expect(localStorageService.download(fileName)).resolves.toBe(
      "Hello, local storage!",
    );

    await localStorageService.deleteFiles([fileName]);
    await expect(localStorageService.listFiles(fileName)).resolves.toEqual([]);
  });

  test("rejects absolute paths and parent-directory escapes", () => {
    expect(() => resolveLocalStoragePath(localPath, "/tmp/escape.txt")).toThrow(
      "Local storage file name must be relative",
    );
    expect(() => resolveLocalStoragePath(localPath, "../escape.txt")).toThrow(
      "Local storage file name escapes configured base path",
    );
  });
});
