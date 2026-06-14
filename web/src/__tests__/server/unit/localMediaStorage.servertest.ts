import { describe, expect, test } from "vitest";

import {
  getLocalMediaDownloadUrl,
  getLocalMediaUploadUrl,
  verifyLocalMediaToken,
} from "@/src/features/media/server/localMediaStorage";

const tokenFromUrl = (url: string): string =>
  new URL(url).searchParams.get("token")!;

describe("local media signed URLs", () => {
  test("creates upload and download tokens scoped to action and media id", () => {
    const uploadUrl = getLocalMediaUploadUrl({
      projectId: "project-1",
      mediaId: "media-1",
      bucketPath: "project-1/media-1.png",
      contentType: "image/png",
      contentLength: 11,
      sha256Hash: "hash",
      ttlSeconds: 60,
    });

    const uploadToken = verifyLocalMediaToken(tokenFromUrl(uploadUrl), {
      action: "upload",
      mediaId: "media-1",
    });
    expect(uploadToken).toMatchObject({
      action: "upload",
      projectId: "project-1",
      mediaId: "media-1",
      bucketPath: "project-1/media-1.png",
      contentType: "image/png",
      contentLength: 11,
      sha256Hash: "hash",
    });

    expect(() =>
      verifyLocalMediaToken(tokenFromUrl(uploadUrl), {
        action: "download",
        mediaId: "media-1",
      }),
    ).toThrow("Local media token does not match request");

    const downloadUrl = getLocalMediaDownloadUrl({
      projectId: "project-1",
      mediaId: "media-1",
      bucketPath: "project-1/media-1.png",
      contentType: "image/png",
      contentLength: 11,
      ttlSeconds: 60,
    });

    expect(() =>
      verifyLocalMediaToken(tokenFromUrl(downloadUrl), {
        action: "download",
        mediaId: "media-2",
      }),
    ).toThrow("Local media token does not match request");
  });
});
