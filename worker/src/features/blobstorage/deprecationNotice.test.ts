import { describe, it, expect } from "vitest";
import {
  BLOB_EXPORT_DEPRECATION_NOTICE_FILENAME,
  buildBlobExportDeprecationNotice,
  buildBlobExportDeprecationNoticeKey,
} from "./deprecationNotice";

describe("buildBlobExportDeprecationNoticeKey", () => {
  it("nests the notice under the project directory", () => {
    expect(buildBlobExportDeprecationNoticeKey({ projectId: "proj-1" })).toBe(
      `proj-1/${BLOB_EXPORT_DEPRECATION_NOTICE_FILENAME}`,
    );
  });

  it("prepends the integration prefix when present", () => {
    expect(
      buildBlobExportDeprecationNoticeKey({
        prefix: "exports/",
        projectId: "proj-1",
      }),
    ).toBe(`exports/proj-1/${BLOB_EXPORT_DEPRECATION_NOTICE_FILENAME}`);
  });

  it("treats an absent prefix the same as an empty one (table-file parity)", () => {
    expect(
      buildBlobExportDeprecationNoticeKey({ prefix: "", projectId: "proj-1" }),
    ).toBe(buildBlobExportDeprecationNoticeKey({ projectId: "proj-1" }));
  });
});

describe("buildBlobExportDeprecationNotice", () => {
  const notice = buildBlobExportDeprecationNotice();

  it("names both the deprecated and recommended sources", () => {
    expect(notice).toContain("Traces and observations (legacy)");
    expect(notice).toContain("Enriched observations (recommended)");
  });

  it("links the public migration guide", () => {
    expect(notice).toContain(
      "https://langfuse.com/docs/api-and-data-platform/features/export-to-blob-storage",
    );
  });

  it("leaks no internal implementation details", () => {
    // This file lands in the customer's bucket: no env vars, flags, or tickets.
    expect(notice).not.toMatch(/LFE-\d+/);
    expect(notice).not.toMatch(/LANGFUSE_/);
    expect(notice).not.toMatch(/TRACES_OBSERVATIONS|EVENTS/);
  });
});
