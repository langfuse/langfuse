import { expect, describe, it, vi } from "vitest";
import { IngestionService } from "../../IngestionService";

describe("IngestionService unit tests", () => {
  it("correctly escapes user provided IDs", async () => {
    const validUuid = "123e4567-e89b-12d3-a456-426614174000";
    const userProvidedId = "user_provided_id_with:colon:chars";
    const expectedEscapedId = "user|#|provided|#|id|#|with|%|colon|%|chars";

    expect((IngestionService as any).escapeReservedChars(userProvidedId)).toBe(
      expectedEscapedId
    );
    expect(
      (IngestionService as any).unescapeReservedChars(expectedEscapedId)
    ).toBe(userProvidedId);

    expect((IngestionService as any).escapeReservedChars(validUuid)).toBe(
      validUuid
    );
  });

  it("correctly sorts records in ascending order by timestamp", async () => {
    const firstTrace = { timestamp: 1 };
    const secondTrace = { timestamp: 2 };
    const thirdTrace = { timestamp: 3 };

    const records = [thirdTrace, firstTrace, secondTrace];

    const sortedRecords = (IngestionService as any).toTimeSortedRecords(
      records
    );

    expect(sortedRecords).toEqual([firstTrace, secondTrace, thirdTrace]);
    expect(sortedRecords).not.toBe(records); // Ensure that the original array is not mutated

    const firstObservation = { start_time: 1 };
    const secondObservation = { start_time: 2 };
    const thirdObservation = { start_time: 3 };

    const observations = [
      thirdObservation,
      firstObservation,
      secondObservation,
    ];

    const sortedObservations = (IngestionService as any).toTimeSortedRecords(
      observations
    );

    expect(sortedObservations).toEqual([
      firstObservation,
      secondObservation,
      thirdObservation,
    ]);
    expect(sortedObservations).not.toBe(observations);
  });
});
