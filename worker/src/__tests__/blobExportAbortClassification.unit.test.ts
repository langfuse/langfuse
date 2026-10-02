import { describe, expect, it } from "vitest";
import {
  BlobExportAbortTracker,
  classifyBlobExportError,
  errorChainText,
} from "../features/blobstorage/abortClassification";

// Mirrors the ClickHouse repository's enrichWithQueryId wrapping.
function withQueryId(message: string, queryId = "qid-123"): Error {
  const base = new Error(message);
  return new Error(`${base.message} [query_id: ${queryId}]`, { cause: base });
}

// Mirrors handleStorageError's wrapping of the underlying cause.
function uploadWrapped(cause: unknown): Error {
  return new Error("Failed to upload file to S3 (buffered)", { cause });
}

describe("errorChainText", () => {
  it("flattens the cause chain with messages and codes", () => {
    const root: NodeJS.ErrnoException = new Error("socket hang up");
    root.code = "ECONNRESET";
    const wrapped = uploadWrapped(root);
    const text = errorChainText(wrapped);
    expect(text).toContain("Failed to upload file to S3 (buffered)");
    expect(text).toContain("socket hang up");
    expect(text).toContain("ECONNRESET");
  });

  it("is cycle-safe", () => {
    const a = new Error("a");
    const b = new Error("b", { cause: a });
    (a as Error & { cause?: unknown }).cause = b;
    expect(() => errorChainText(a)).not.toThrow();
  });

  it("preserves an appended query_id", () => {
    expect(errorChainText(withQueryId("aborted"))).toContain(
      "[query_id: qid-123]",
    );
  });
});

describe("BlobExportAbortTracker.origin", () => {
  it("returns undefined when nothing recorded", () => {
    expect(new BlobExportAbortTracker().origin()).toBeUndefined();
  });

  it("classifies a concrete ClickHouse exception as ch-error", () => {
    const t = new BlobExportAbortTracker();
    t.record(
      "ch-read",
      withQueryId("Code: 241. DB::Exception: Memory limit exceeded"),
      1,
    );
    const origin = t.origin();
    expect(origin?.reason).toBe("ch-error");
    expect(origin?.stage).toBe("ch-read");
    expect(origin?.concrete).toBe(true);
    expect(origin?.chain).toContain("query_id");
  });

  it("classifies a concrete S3 fault as upload-error even when ch-read also tore down", () => {
    const t = new BlobExportAbortTracker();
    // ch-read records the teardown first (earlier timestamp)...
    t.record("ch-read", new Error("Premature close"), 1);
    // ...but the concrete S3 fault is the real cause and must win.
    t.record("upload", uploadWrapped(new Error("SlowDown: reduce rate")), 2);
    const origin = t.origin();
    expect(origin?.reason).toBe("upload-error");
    expect(origin?.stage).toBe("upload");
    expect(origin?.concrete).toBe(true);
  });

  it("attributes a bare mutual 'aborted' to the stage that failed first (ch-read)", () => {
    // The prod-us signature: CH stream aborts first, the upload then surfaces
    // the same wrapped 'aborted [query_id]'. Both are generic teardown, so the
    // earliest (ch-read) wins with best-effort attribution.
    const t = new BlobExportAbortTracker();
    const chAborted = withQueryId("aborted");
    t.record("ch-read", chAborted, 1);
    t.record("upload", uploadWrapped(chAborted), 2);
    const origin = t.origin();
    expect(origin?.reason).toBe("ch-error");
    expect(origin?.stage).toBe("ch-read");
    expect(origin?.concrete).toBe(false);
    expect(origin?.chain).toContain("[query_id: qid-123]");
  });

  it("does not misclassify an S3 HTTP 'status code: 503' as ch-error", () => {
    // Regression: a bare `code:\s*\d+` matched "status code: 503" and flipped
    // upload errors to ch-error. The S3 message has no upload-fault keyword, so
    // it must fall through to stage attribution (upload), not CH detection.
    const t = new BlobExportAbortTracker();
    t.record(
      "upload",
      uploadWrapped(
        new Error(
          "InternalError: We encountered an internal error. status code: 503",
        ),
      ),
      1,
    );
    expect(t.origin()?.reason).toBe("upload-error");
  });

  it("classifies a DB::NetException socket timeout as ch-error", () => {
    const t = new BlobExportAbortTracker();
    t.record(
      "upload",
      uploadWrapped(
        withQueryId(
          "Code: 209. DB::NetException: Timeout exceeded while reading from socket",
        ),
      ),
      1,
    );
    expect(t.origin()?.reason).toBe("ch-error");
  });

  it("classifies a shutdown-stage record as shutdown", () => {
    const t = new BlobExportAbortTracker();
    t.record("ch-read", new Error("aborted"), 1);
    t.record("shutdown", new Error("aborted"), 2);
    expect(t.origin()?.reason).toBe("shutdown");
  });

  it("prefers a concrete fault over an earlier generic teardown regardless of order", () => {
    const t = new BlobExportAbortTracker();
    t.record("upload", uploadWrapped(new Error("socket hang up")), 5);
    t.record(
      "ch-read",
      withQueryId("Code: 159. DB::Exception: Timeout exceeded"),
      10,
    );
    expect(t.origin()?.reason).toBe("ch-error");
  });
});

describe("classifyBlobExportError", () => {
  it("classifies an unknown-stage generic error as unknown", () => {
    const origin = classifyBlobExportError(new Error("aborted"));
    expect(origin.reason).toBe("unknown");
    expect(origin.stage).toBe("unknown");
  });

  it("classifies a ClickHouse exception by its chain even without stage", () => {
    const origin = classifyBlobExportError(
      withQueryId("Code: 241. DB::Exception: Memory limit exceeded"),
    );
    expect(origin.reason).toBe("ch-error");
  });
});
