import { describe, it, expect } from "vitest";
import { OtelIngestionProcessor } from "@langfuse/shared/src/server";

describe("OtelIngestionProcessor.buildOtelIngestionJob propagated headers", () => {
  it("includes propagatedHeaders on the queue payload when configured", () => {
    const processor = new OtelIngestionProcessor({
      projectId: "test-project",
      orgId: "test-org",
      publicKey: "pk-lf-test",
      propagatedHeaders: {
        intuit_tid: "abc-123",
        "x-langfuse-test": "ok",
      },
    });

    const job = processor.buildOtelIngestionJob("test-file-key.json");

    expect(job.payload.propagatedHeaders).toEqual({
      intuit_tid: "abc-123",
      "x-langfuse-test": "ok",
    });
  });

  it("passes propagatedHeaders as undefined when none are configured", () => {
    const processor = new OtelIngestionProcessor({
      projectId: "test-project",
      orgId: "test-org",
      publicKey: "pk-lf-test",
    });

    const job = processor.buildOtelIngestionJob("test-file-key.json");

    expect(job.payload.propagatedHeaders).toBeUndefined();
  });

  it("preserves arbitrary header values on the queue payload (no normalization)", () => {
    const processor = new OtelIngestionProcessor({
      projectId: "test-project",
      orgId: "test-org",
      publicKey: "pk-lf-test",
      propagatedHeaders: {
        // Underscored header — relevant to the Intuit case where intuit_tid
        // must survive untouched all the way to the masking callback. The
        // processor stores whatever it was handed; any drop must therefore
        // happen earlier (e.g. an upstream proxy that strips underscored
        // headers before Node sees them) rather than inside this code path.
        intuit_tid: "trace-id-with-underscore",
      },
    });

    const job = processor.buildOtelIngestionJob("test-file-key.json");

    expect(job.payload.propagatedHeaders).toEqual({
      intuit_tid: "trace-id-with-underscore",
    });
  });

  it("populates the rest of the queue payload with project context", () => {
    const processor = new OtelIngestionProcessor({
      projectId: "test-project",
      orgId: "test-org",
      publicKey: "pk-lf-test",
      sdkName: "langfuse-python",
      sdkVersion: "2.60.3",
      ingestionVersion: "4",
    });

    const job = processor.buildOtelIngestionJob("test-file-key.json");

    expect(job.payload.data).toEqual({
      fileKey: "test-file-key.json",
      publicKey: "pk-lf-test",
    });
    expect(job.payload.authCheck).toEqual({
      validKey: true,
      scope: {
        projectId: "test-project",
        accessLevel: "project",
        orgId: "test-org",
      },
    });
    expect(job.payload.sdkName).toBe("langfuse-python");
    expect(job.payload.sdkVersion).toBe("2.60.3");
    expect(job.payload.ingestionVersion).toBe("4");
  });
});
