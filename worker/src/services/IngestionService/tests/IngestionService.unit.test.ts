import { expect, describe, it, vi } from "vitest";
import { IngestionService } from "../../IngestionService";
import { IngestionUtils } from "@langfuse/shared/src/server";

describe("IngestionService unit tests", () => {
  it("correctly escapes user provided IDs", async () => {
    const validUuid = "123e4567-e89b-12d3-a456-426614174000";
    const userProvidedId = "user_provided_id_with:colon:chars";
    const expectedEscapedId = "user|#|provided|#|id|#|with|%|colon|%|chars";

    expect((IngestionUtils as any).escapeReservedChars(userProvidedId)).toBe(
      expectedEscapedId
    );
    expect(
      (IngestionUtils as any).unescapeReservedChars(expectedEscapedId)
    ).toBe(userProvidedId);

    expect((IngestionUtils as any).escapeReservedChars(validUuid)).toBe(
      validUuid
    );
  });

  it("correctly sorts events in ascending order by timestamp", async () => {
    const firstTrace = { timestamp: 1, type: "observation-create" };
    const secondTrace = { timestamp: 1, type: "observation-update" };
    const thirdTrace = { timestamp: 3, type: "observation-update" };

    const records = [thirdTrace, secondTrace, firstTrace];

    const sortedEventList = (IngestionService as any).toTimeSortedEventList(
      records
    );

    expect(sortedEventList).toEqual([firstTrace, secondTrace, thirdTrace]);
    expect(sortedEventList).not.toBe(records); // Ensure that the original array is not mutated
  });
});
