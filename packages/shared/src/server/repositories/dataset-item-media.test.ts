import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  recordHistogram: vi.fn(),
  recordIncrement: vi.fn(),
  addTagsToCurrentSpan: vi.fn(),
}));

vi.mock("../../db", () => ({
  prisma: {
    media: {
      findUnique: mocks.findUnique,
      update: mocks.update,
      updateMany: mocks.updateMany,
    },
  },
}));

vi.mock("../instrumentation", () => ({
  recordHistogram: mocks.recordHistogram,
  recordIncrement: mocks.recordIncrement,
  addTagsToCurrentSpan: mocks.addTagsToCurrentSpan,
}));

import { InvalidRequestError } from "../../errors/InvalidRequestError";
import { LangfuseNotFoundError } from "../../errors/NotFoundError";
import { markDatasetMediaUploadComplete } from "./dataset-item-media";

type MediaRow = {
  uploadHttpStatus: number | null;
  uploadedAt?: Date;
  uploadHttpError?: string | null;
};

const PROJECT_ID = "project-id";
const MEDIA_ID = "media-id";

function isCompletedUploadHttpStatus(status: number | null | undefined) {
  return status === 200 || status === 201;
}

function installStatefulMedia(initial: MediaRow | null) {
  let row: MediaRow | null = initial === null ? null : { ...initial };
  const writes: { status: number }[] = [];
  let releaseFailureWrite = () => {};
  const failureWriteGate = new Promise<void>((resolve) => {
    releaseFailureWrite = resolve;
  });
  let signalFailureWriteStarted = () => {};
  const failureWriteStarted = new Promise<void>((resolve) => {
    signalFailureWriteStarted = resolve;
  });

  mocks.findUnique.mockImplementation(async () =>
    row ? { uploadHttpStatus: row.uploadHttpStatus } : null,
  );

  const applyUnconditionalWrite = async (
    data: MediaRow & { uploadHttpStatus: number },
  ) => {
    if (row === null) {
      throw new Error("Record to update not found");
    }
    row = { ...row, ...data };
    writes.push({ status: data.uploadHttpStatus });
    return row;
  };

  const applyConditionalFailureWrite = async (
    data: MediaRow & { uploadHttpStatus: number },
  ) => {
    if (row === null || isCompletedUploadHttpStatus(row.uploadHttpStatus)) {
      return { count: 0 };
    }
    row = { ...row, ...data };
    writes.push({ status: data.uploadHttpStatus });
    return { count: 1 };
  };

  mocks.update.mockImplementation(async ({ data }) => {
    if (!isCompletedUploadHttpStatus(data.uploadHttpStatus)) {
      signalFailureWriteStarted();
      await failureWriteGate;
    }
    return applyUnconditionalWrite(data);
  });

  mocks.updateMany.mockImplementation(async ({ data }) => {
    if (!isCompletedUploadHttpStatus(data.uploadHttpStatus)) {
      signalFailureWriteStarted();
      await failureWriteGate;
    }
    return applyConditionalFailureWrite(data);
  });

  return {
    getRow: () => row,
    writes,
    failureWriteStarted,
    releaseFailureWrite: () => releaseFailureWrite(),
  };
}

const completeProps = (
  status: number,
  extra?: { uploadHttpError?: string },
) => ({
  projectId: PROJECT_ID,
  mediaId: MEDIA_ID,
  uploadedAt: new Date("2026-01-01T00:00:00.000Z"),
  uploadHttpStatus: status,
  ...extra,
});

describe("markDatasetMediaUploadComplete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records a successful completion on a pending row", async () => {
    const store = installStatefulMedia({ uploadHttpStatus: null });

    await markDatasetMediaUploadComplete(completeProps(200));

    expect(store.getRow()?.uploadHttpStatus).toBe(200);
    expect(store.getRow()?.uploadHttpError).toBeNull();
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("treats HTTP 201 as a completed upload and rejects a later failure", async () => {
    const store = installStatefulMedia({ uploadHttpStatus: 201 });

    await expect(
      markDatasetMediaUploadComplete(
        completeProps(500, { uploadHttpError: "late failure" }),
      ),
    ).rejects.toThrow(/already has a completed upload/);

    expect(store.getRow()?.uploadHttpStatus).toBe(201);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("records a failure while the upload is still pending", async () => {
    const store = installStatefulMedia({ uploadHttpStatus: null });
    // No concurrent success, so release the failure write immediately.
    store.releaseFailureWrite();

    await markDatasetMediaUploadComplete(
      completeProps(500, { uploadHttpError: "network error" }),
    );

    expect(store.getRow()?.uploadHttpStatus).toBe(500);
    expect(store.getRow()?.uploadHttpError).toBe("network error");
    expect(mocks.updateMany).toHaveBeenCalledTimes(1);
  });

  it("throws when the media row does not exist", async () => {
    installStatefulMedia(null);

    await expect(
      markDatasetMediaUploadComplete(completeProps(200)),
    ).rejects.toBeInstanceOf(LangfuseNotFoundError);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("does not let a stale failure report overwrite a completed upload", async () => {
    const store = installStatefulMedia({ uploadHttpStatus: null });

    const failure = markDatasetMediaUploadComplete(
      completeProps(500, { uploadHttpError: "stale failure" }),
    );
    await store.failureWriteStarted;

    await markDatasetMediaUploadComplete(completeProps(200));
    expect(store.getRow()?.uploadHttpStatus).toBe(200);

    store.releaseFailureWrite();

    await expect(failure).rejects.toBeInstanceOf(InvalidRequestError);
    await expect(failure).rejects.toThrow(/already has a completed upload/);

    expect(store.getRow()?.uploadHttpStatus).toBe(200);
    expect(store.getRow()?.uploadHttpError).toBeNull();
    expect(store.writes).toEqual([{ status: 200 }]);
  });
});
