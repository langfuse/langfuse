import { describe, expect, it } from "vitest";

import { StorageServiceFactory, storageKeys } from "../services/StorageService";
import { getMediaDownloadUrl } from "./getMediaDownloadUrl";

const storageService = StorageServiceFactory.getInstance({
  credentials: storageKeys("test-access-key", "test-secret-key"),
  bucketName: "media-bucket",
  endpoint: "http://localhost:9090",
  region: "us-east-1",
  forcePathStyle: true,
  useAzureBlob: false,
  useGoogleCloudStorage: false,
  useOCIObjectStorage: false,
  awsSse: undefined,
  awsSseKmsKeyId: undefined,
});

const signedQuery = async (bucketPath: string, contentType: string) =>
  new URL(
    await getMediaDownloadUrl({
      storageService,
      bucketPath,
      contentType,
      ttlSeconds: 60,
    }),
  ).searchParams;

describe("getMediaDownloadUrl", () => {
  it("signs active content as a download with the recorded type", async () => {
    const query = await signedQuery("project/media.html", "text/html");

    expect(query.get("response-content-disposition")).toBe(
      'attachment; filename="project/media.html"',
    );
    expect(query.get("response-content-type")).toBe("text/html");
  });

  it("keeps images inline with the recorded type", async () => {
    const query = await signedQuery("project/media.png", "image/png");

    expect(query.get("response-content-disposition")).toBeNull();
    expect(query.get("response-content-type")).toBe("image/png");
  });
});
