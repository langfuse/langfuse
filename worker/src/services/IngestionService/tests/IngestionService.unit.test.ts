import { expect, describe, it } from "vitest";
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
});
