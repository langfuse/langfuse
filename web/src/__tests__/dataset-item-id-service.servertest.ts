import { DatasetItemIdService } from "../features/datasets/server/dataset-item-id-service";

describe("DatasetItemIdService", () => {
  describe("normalizeProjectName", () => {
    it("should normalize project names correctly", () => {
      // Access private method through type assertion for testing
      const normalizeProjectName = (DatasetItemIdService as any)
        .normalizeProjectName;

      expect(normalizeProjectName("AIR")).toBe("AIR");
      expect(normalizeProjectName("Air Project")).toBe("AIR_PROJECT");
      expect(normalizeProjectName("my-project-2024")).toBe("MY_PROJECT");
      expect(normalizeProjectName("Project With Spaces & Special!")).toBe(
        "PROJECT_WI",
      );
      expect(normalizeProjectName("___test___")).toBe("TEST");
      expect(normalizeProjectName("")).toBe("");
      expect(normalizeProjectName("a")).toBe("A");
      expect(normalizeProjectName("VeryLongProjectNameThatExceedsLimit")).toBe(
        "VERYLONGPR",
      );
    });
  });

  describe("isFriendlyId", () => {
    it("should correctly identify friendly IDs", () => {
      expect(DatasetItemIdService.isFriendlyId("AIR-0001")).toBe(true);
      expect(DatasetItemIdService.isFriendlyId("PROJECT_A-9999")).toBe(true);
      expect(DatasetItemIdService.isFriendlyId("TEST-0000")).toBe(true);
      expect(DatasetItemIdService.isFriendlyId("A-0001")).toBe(true);

      expect(DatasetItemIdService.isFriendlyId("AIR-001")).toBe(false); // Only 3 digits
      expect(DatasetItemIdService.isFriendlyId("AIR-00001")).toBe(false); // 5 digits
      expect(DatasetItemIdService.isFriendlyId("air-0001")).toBe(false); // Lowercase
      expect(
        DatasetItemIdService.isFriendlyId("AIR_PROJECT_VERY_LONG-0001"),
      ).toBe(false); // Too long prefix
      expect(DatasetItemIdService.isFriendlyId("123-0001")).toBe(false); // Starts with number
      expect(DatasetItemIdService.isFriendlyId("AIR-ABC1")).toBe(false); // Non-numeric sequence
      expect(DatasetItemIdService.isFriendlyId("cuid123456789")).toBe(false); // CUID format
    });
  });

  describe("extractPrefix", () => {
    it("should extract prefix correctly", () => {
      expect(DatasetItemIdService.extractPrefix("AIR-0001")).toBe("AIR");
      expect(DatasetItemIdService.extractPrefix("PROJECT_A-9999")).toBe(
        "PROJECT_A",
      );
      expect(DatasetItemIdService.extractPrefix("invalid-id")).toBe(null);
      expect(DatasetItemIdService.extractPrefix("AIR-001")).toBe(null);
    });
  });

  describe("extractSequence", () => {
    it("should extract sequence number correctly", () => {
      expect(DatasetItemIdService.extractSequence("AIR-0001")).toBe(1);
      expect(DatasetItemIdService.extractSequence("PROJECT_A-9999")).toBe(9999);
      expect(DatasetItemIdService.extractSequence("TEST-0000")).toBe(0);
      expect(DatasetItemIdService.extractSequence("invalid-id")).toBe(null);
      expect(DatasetItemIdService.extractSequence("AIR-001")).toBe(null);
    });
  });

  describe("generateFriendlyId", () => {
    // Note: These tests would need actual database setup and mocking
    // They are more integration tests and would be better placed in a separate file
    it("should be tested with actual database in integration tests", () => {
      expect(true).toBe(true);
    });
  });
});
