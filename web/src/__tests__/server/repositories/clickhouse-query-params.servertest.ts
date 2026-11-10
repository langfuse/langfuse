import { queryClickhouse } from "@langfuse/shared/src/server";

describe("queryClickhouse parameters", () => {
  it("binds parameters for SQL longer than a multipart form field", async () => {
    // ClickHouse rejects multipart/form-data parts larger than
    // http_max_field_value_size (128 KiB by default).
    const padding = `/* ${"x".repeat(150_000)} */`;

    const rows = await queryClickhouse<{ value: string }>({
      query: `SELECT {value: String} AS value ${padding}`,
      params: { value: "bound" },
    });

    expect(rows).toEqual([{ value: "bound" }]);
  });
});
