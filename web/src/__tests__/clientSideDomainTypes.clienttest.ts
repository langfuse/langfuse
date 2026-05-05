import {
  stringifyClientJsonValue,
  stringifyMetadata,
} from "@/src/utils/clientSideDomainTypes";

describe("clientSideDomainTypes", () => {
  describe("metadata serialization helpers", () => {
    it("does not double-stringify metadata returned from tRPC", () => {
      const metadata = JSON.stringify({ prototype: "test", safeKey: "value" });

      expect(stringifyMetadata(metadata)).toBe(metadata);
    });

    it("stringifies client JSON values without double-stringifying strings", () => {
      const input = JSON.stringify({ prototype: "test", safeKey: "value" });

      expect(stringifyClientJsonValue({ prototype: "test" })).toBe(
        JSON.stringify({ prototype: "test" }),
      );
      expect(stringifyClientJsonValue(input)).toBe(input);
    });
  });
});
