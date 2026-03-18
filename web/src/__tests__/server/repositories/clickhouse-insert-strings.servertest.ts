import { createEvent, createEventsCh } from "@langfuse/shared/src/server";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

describe("ClickHouse insert string edge cases", () => {
  describe("prompt_version type mismatch (UInt16 column vs string value)", () => {
    it("should handle prompt_version as null", async () => {
      const event = createEvent({
        project_id: projectId,
        prompt_version: null,
      });
      await expect(createEventsCh([event])).resolves.not.toThrow();
    });

    it("should handle prompt_version as undefined", async () => {
      const event = createEvent({
        project_id: projectId,
        prompt_version: undefined,
      });
      await expect(createEventsCh([event])).resolves.not.toThrow();
    });

    it("should handle prompt_version as numeric string '42'", async () => {
      const event = createEvent({
        project_id: projectId,
        prompt_version: "42",
      });
      await expect(createEventsCh([event])).resolves.not.toThrow();
    });

    it("should handle prompt_version as numeric 42", async () => {
      const event = createEvent({
        project_id: projectId,
        prompt_version: 42,
      });
      await expect(createEventsCh([event])).resolves.not.toThrow();
    });

    it("should fail or handle prompt_version as non-numeric string 'local'", async () => {
      // This is the exact scenario from the production error.
      // prompt_version = "local" cannot be parsed as UInt16 by ClickHouse.
      const event = createEvent({
        project_id: projectId,
        prompt_version: "local",
      });

      await expect(createEventsCh([event])).rejects.toThrow(/Cannot parse/);
    });

    it("should fail or handle prompt_version as semantic version string 'v1.0.0'", async () => {
      const event = createEvent({
        project_id: projectId,
        prompt_version: "v1.0.0",
      });

      await expect(createEventsCh([event])).rejects.toThrow(/Cannot parse/);
    });
  });
});
