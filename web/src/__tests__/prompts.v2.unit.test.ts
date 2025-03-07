/** @jest-environment node */

import { parsePromptDependencyTags } from "@langfuse/shared/src/server";

describe("Prompt dependency management", () => {
  describe("Parsing prompt dependency tags", () => {
    it("should extract prompt dependency tags with version", () => {
      const content =
        "This is a test with @@@langfusePrompt:name=test|version=1@@@ dependency";
      const result = parsePromptDependencyTags(content);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: "test",
        version: 1,
        type: "version",
      });
    });
    it("should handle prompt names with special characters", () => {
      const content = `
        @@@langfusePrompt:name=test-with-hyphens|version=1@@@
        @@@langfusePrompt:name=test with spaces|label=production@@@
        @@@langfusePrompt:name=test_with_underscores|version=2@@@
        @@@langfusePrompt:name=test.with.dots|label=staging@@@
        @@@langfusePrompt:name=test123WithNumbers|version=3@@@
      `;
      const result = parsePromptDependencyTags(content);

      expect(result).toHaveLength(5);
      expect(result[0]).toEqual({
        name: "test-with-hyphens",
        version: 1,
        type: "version",
      });
      expect(result[1]).toEqual({
        name: "test with spaces",
        label: "production",
        type: "label",
      });
      expect(result[2]).toEqual({
        name: "test_with_underscores",
        version: 2,
        type: "version",
      });
      expect(result[3]).toEqual({
        name: "test.with.dots",
        label: "staging",
        type: "label",
      });
      expect(result[4]).toEqual({
        name: "test123WithNumbers",
        version: 3,
        type: "version",
      });
    });

    it("should extract prompt dependency tags with label", () => {
      const content =
        "This is a test with @@@langfusePrompt:name=test|label=production@@@ dependency";
      const result = parsePromptDependencyTags(content);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: "test",
        label: "production",
        type: "label",
      });
    });

    it("should extract multiple prompt dependency tags", () => {
      const content = `
        First dependency: @@@langfusePrompt:name=first|version=1@@@
        Second dependency: @@@langfusePrompt:name=second|label=staging@@@
      `;
      const result = parsePromptDependencyTags(content);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        name: "first",
        version: 1,
        type: "version",
      });
      expect(result[1]).toEqual({
        name: "second",
        label: "staging",
        type: "label",
      });
    });

    it("should ignore invalid prompt dependency tags", () => {
      const content = `
        Valid: @@@langfusePrompt:name=valid|version=1@@@
        Invalid: @@@langfusePrompt:version=1@@@
        Also invalid: @@@langfusePrompt:name=invalid|something=else@@@
      `;
      const result = parsePromptDependencyTags(content);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: "valid",
        version: 1,
        type: "version",
      });
    });

    it("should return empty array when no tags are found", () => {
      const content = "This is a test with no dependency tags";
      const result = parsePromptDependencyTags(content);

      expect(result).toEqual([]);
    });

    it("should handle tags with special characters in name", () => {
      const content =
        "Tag with special chars @@@langfusePrompt:name=test-prompt_123|version=2@@@";
      const result = parsePromptDependencyTags(content);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: "test-prompt_123",
        version: 2,
        type: "version",
      });
    });

    it("should handle tags with special characters in label", () => {
      const content =
        "Tag with special chars @@@langfusePrompt:name=test|label=prod-v1.0_beta@@@";
      const result = parsePromptDependencyTags(content);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: "test",
        label: "prod-v1.0_beta",
        type: "label",
      });
    });

    it("should correctly coerce version to number", () => {
      const content =
        "Version as string @@@langfusePrompt:name=test|version=123@@@";
      const result = parsePromptDependencyTags(content);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: "test",
        version: 123,
        type: "version",
      });
      expect(typeof (result[0] as any).version).toBe("number");
    });

    it("should handle tags with spaces in the content", () => {
      const content =
        "Tag with spaces @@@langfusePrompt:name=my prompt|label=production label@@@";
      const result = parsePromptDependencyTags(content);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: "my prompt",
        label: "production label",
        type: "label",
      });
    });

    it("should handle multiple tags with the same name but different versions/labels", () => {
      const content = `
        @@@langfusePrompt:name=same|version=1@@@
        @@@langfusePrompt:name=same|version=2@@@
        @@@langfusePrompt:name=same|label=production@@@
      `;
      const result = parsePromptDependencyTags(content);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ name: "same", version: 1, type: "version" });
      expect(result[1]).toEqual({ name: "same", version: 2, type: "version" });
      expect(result[2]).toEqual({
        name: "same",
        label: "production",
        type: "label",
      });
    });

    it("should handle tags with the PRODUCTION_LABEL constant value", () => {
      const content = "@@@langfusePrompt:name=test|label=production@@@";
      const result = parsePromptDependencyTags(content);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: "test",
        label: "production",
        type: "label",
      });
    });

    it("should ignore malformed tags that don't match the regex pattern", () => {
      const content = `
        Valid: @@@langfusePrompt:name=valid|version=1@@@
        Malformed: @@langfusePrompt:name=test|version=1@@
        Also malformed: @@@langfusePrompt:name=test|version=1
        And: langfusePrompt:name=test|version=1@@@
      `;
      const result = parsePromptDependencyTags(content);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: "valid",
        version: 1,
        type: "version",
      });
    });
    it("should not parse langfuseMedia tags as prompt dependency tags", () => {
      const content = `
        @@@langfusePrompt:name=valid|version=1@@@
        @@@langfuseMedia:type=image/jpeg|id=cc48838a-3da8-4ca4-a007-2cf8df930e69|source=base64@@@
        @@@langfusePrompt:name=another|label=production@@@
      `;
      const result = parsePromptDependencyTags(content);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        name: "valid",
        version: 1,
        type: "version",
      });
      expect(result[1]).toEqual({
        name: "another",
        label: "production",
        type: "label",
      });
    });

    it("should reject tags where name is not the first parameter", () => {
      const content = `
        Valid: @@@langfusePrompt:name=valid|version=1@@@
        Invalid: @@@langfusePrompt:version=1|name=test@@@
      `;
      const result = parsePromptDependencyTags(content);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: "valid",
        version: 1,
        type: "version",
      });
    });
  });
});
