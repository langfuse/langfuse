import { createEvent, createEventsCh } from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

const isEventsTableV2Enabled =
  env.LANGFUSE_ENABLE_EVENTS_TABLE_V2_APIS === "true" ? it : it.skip;
let hasLegacyEventsTable = false;

const maybeIt = (name: string, testFn: () => Promise<void>): void => {
  isEventsTableV2Enabled(name, async () => {
    if (!hasLegacyEventsTable) return;
    await testFn();
  });
};

describe("ClickHouse insert string edge cases", () => {
  it("should pass", () => {
    // Apparently each jest file needs at least one executed test and cannot have everything skipped
    expect(true).toBe(true);
  });

  describe("prompt_version type mismatch (UInt16 column vs string value)", () => {
    maybeIt("should handle prompt_version as null", async () => {
      const event = createEvent({
        project_id: projectId,
        prompt_version: null,
      });
      await expect(createEventsCh([event])).resolves.not.toThrow();
    });

    maybeIt("should handle prompt_version as undefined", async () => {
      const event = createEvent({
        project_id: projectId,
        prompt_version: undefined,
      });
      await expect(createEventsCh([event])).resolves.not.toThrow();
    });

    maybeIt("should handle prompt_version as numeric string '42'", async () => {
      const event = createEvent({
        project_id: projectId,
        prompt_version: "42",
      });
      await expect(createEventsCh([event])).resolves.not.toThrow();
    });

    maybeIt("should handle prompt_version as numeric 42", async () => {
      const event = createEvent({
        project_id: projectId,
        prompt_version: 42,
      });
      await expect(createEventsCh([event])).resolves.not.toThrow();
    });

    maybeIt(
      "should fail or handle prompt_version as non-numeric string 'local'",
      async () => {
        // This is the exact scenario from the production error.
        // prompt_version = "local" cannot be parsed as UInt16 by ClickHouse.
        const event = createEvent({
          project_id: projectId,
          prompt_version: "local",
        });

        await expect(createEventsCh([event])).rejects.toThrow(/Cannot parse/);
      },
    );

    maybeIt(
      "should fail or handle prompt_version as semantic version string 'v1.0.0'",
      async () => {
        const event = createEvent({
          project_id: projectId,
          prompt_version: "v1.0.0",
        });

        await expect(createEventsCh([event])).rejects.toThrow(/Cannot parse/);
      },
    );
  });

  describe("Invalid string length on oversized JSON payload", () => {
    maybeIt(
      "should throw 'Size of JSON object' when input exceeds clickhouse byte limit",
      async () => {
        const hugeString = "x".repeat(300 * 1024 * 1024);

        const event = createEvent({
          project_id: projectId,
          input: hugeString,
        });

        await expect(createEventsCh([event])).rejects.toThrow(
          /Size of JSON object/,
        );
      },
    );

    maybeIt(
      "should throw 'Invalid string length' when input exceeds V8 string limit",
      async () => {
        // V8 max string length is ~536_870_888 chars on 64-bit systems.
        // A 512 MB input string causes JSON.stringify to exceed that limit
        // when it serialises the full event row.
        const hugeString = "x".repeat(300 * 1024 * 1024);

        const event = createEvent({
          project_id: projectId,
          input: hugeString,
          output: hugeString,
        });

        await expect(createEventsCh([event])).rejects.toThrow(
          /Invalid string length/,
        );
      },
    );
  });
});
