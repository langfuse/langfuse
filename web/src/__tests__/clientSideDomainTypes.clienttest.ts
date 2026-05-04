import {
  parseStringifiedMetadata,
  stringifyMetadata,
} from "@/src/utils/clientSideDomainTypes";

describe("clientSideDomainTypes", () => {
  describe("metadata serialization helpers", () => {
    it("does not double-stringify metadata returned from tRPC", () => {
      const metadata = JSON.stringify({ prototype: "test", safeKey: "value" });

      expect(stringifyMetadata(metadata)).toBe(metadata);
    });

    it("deserializes stringified metadata on the client", () => {
      const metadata = JSON.stringify({ prototype: "test", safeKey: "value" });

      expect(parseStringifiedMetadata(metadata)).toEqual({
        prototype: "test",
        safeKey: "value",
      });
    });
  });
});
