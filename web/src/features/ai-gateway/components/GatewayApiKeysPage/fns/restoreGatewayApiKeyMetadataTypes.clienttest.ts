import { describe, expect, it } from "vitest";
import { restoreGatewayApiKeyMetadataTypes } from "./restoreGatewayApiKeyMetadataTypes";
import { toGatewayApiKeyMetadata } from "./toGatewayApiKeyMetadata";
import { toGatewayApiKeyMetadataRows } from "./toGatewayApiKeyMetadataRows";

describe("restoreGatewayApiKeyMetadataTypes", () => {
  it("keeps unchanged numbers and booleans typed and edited values as text", () => {
    const stored = { costCenter: 42, enabled: false, retries: 3 };
    const rows = toGatewayApiKeyMetadataRows(stored).map((row) =>
      row.key === "retries" ? { ...row, value: "5" } : row,
    );

    expect(
      restoreGatewayApiKeyMetadataTypes(toGatewayApiKeyMetadata(rows), stored),
    ).toEqual({ costCenter: 42, enabled: false, retries: "5" });
  });
});
