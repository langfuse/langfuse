import { describe, expect, it, vi } from "vitest";

import { env } from "../../env";
import {
  type StorageService,
  StorageServiceFactory,
  storageKeys,
} from "../services/StorageService";
import { getMediaDownloadUrl } from "./getMediaDownloadUrl";

// Azure would otherwise create the container before signing offline.
env.LANGFUSE_AZURE_SKIP_CONTAINER_CHECK = "true";

const baseParams = {
  bucketName: "media-bucket",
  region: "us-east-1",
  forcePathStyle: true,
  awsSse: undefined,
  awsSseKmsKeyId: undefined,
};

const providers: Array<{
  name: string;
  storageService: StorageService;
  dispositionParam: string;
  contentTypeParam: string;
}> = [
  {
    name: "S3",
    storageService: StorageServiceFactory.getInstance({
      ...baseParams,
      credentials: storageKeys("test-access-key", "test-secret-key"),
      endpoint: "http://localhost:9090",
      useAzureBlob: false,
      useGoogleCloudStorage: false,
      useOCIObjectStorage: false,
    }),
    dispositionParam: "response-content-disposition",
    contentTypeParam: "response-content-type",
  },
  {
    name: "Azure",
    storageService: StorageServiceFactory.getInstance({
      ...baseParams,
      credentials: storageKeys(
        "devstoreaccount1",
        Buffer.from("test-account-key").toString("base64"),
      ),
      endpoint: "http://localhost:10000/devstoreaccount1",
      useAzureBlob: true,
    }),
    dispositionParam: "rscd",
    contentTypeParam: "rsct",
  },
];

describe.each(providers)(
  "getMediaDownloadUrl on $name",
  ({ storageService, dispositionParam, contentTypeParam }) => {
    const signedQuery = async (bucketPath: string, contentType: string) => {
      const url = await getMediaDownloadUrl({
        storageService,
        bucketPath,
        contentType,
        ttlSeconds: 60,
      });
      return new URL(url ?? "").searchParams;
    };

    it("signs active content as a download with the recorded type", async () => {
      const query = await signedQuery("project/media.html", "text/html");

      expect(query.get(dispositionParam)).toBe(
        'attachment; filename="project/media.html"',
      );
      expect(query.get(contentTypeParam)).toBe("text/html");
    });

    it("keeps images inline with the recorded type", async () => {
      const query = await signedQuery("project/media.png", "image/png");

      expect(query.get(dispositionParam)).toBeNull();
      expect(query.get(contentTypeParam)).toBe("image/png");
    });
  },
);

describe("getMediaDownloadUrl on a provider that cannot pin response headers", () => {
  const getSignedUrl = vi.fn(async () => "https://storage.example.com/par");
  const storageService = {
    canOverrideResponseHeaders: false,
    getSignedUrl,
  } as unknown as StorageService;
  const downloadUrl = (contentType: string) =>
    getMediaDownloadUrl({
      storageService,
      bucketPath: "project/media",
      contentType,
      ttlSeconds: 60,
    });

  it("returns no link for active content", async () => {
    await expect(downloadUrl("image/svg+xml")).resolves.toBeNull();
    await expect(downloadUrl("text/html; charset=utf-8")).resolves.toBeNull();
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it("still links safe-inline media", async () => {
    await expect(downloadUrl("image/png")).resolves.toBe(
      "https://storage.example.com/par",
    );
  });
});
