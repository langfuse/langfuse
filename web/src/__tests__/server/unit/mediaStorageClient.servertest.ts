import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getInstance: vi.fn(({ bucketName }: { bucketName: string }) => ({
    bucketName,
  })),
}));

vi.mock("@/src/env.mjs", () => ({ env: {} }));
vi.mock("@langfuse/shared/src/server", () => ({
  resolveMediaStorageEndpoints: () => ({}),
  StorageServiceFactory: { getInstance: mocks.getInstance },
}));

import { getMediaStorageServiceClient } from "@/src/features/media/server/getMediaStorageClient";

it("uses the bucket belonging to each media record", () => {
  const oldBucket = getMediaStorageServiceClient("old-bucket");
  const newBucket = getMediaStorageServiceClient("new-bucket");

  expect(oldBucket).not.toBe(newBucket);
  expect(getMediaStorageServiceClient("old-bucket")).toBe(oldBucket);
  expect(
    mocks.getInstance.mock.calls.map(([params]) => params.bucketName),
  ).toEqual(["old-bucket", "new-bucket"]);
});
