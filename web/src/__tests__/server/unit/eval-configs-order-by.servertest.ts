import { InvalidRequestError } from "@langfuse/shared";
import { orderByToPrismaSql } from "@langfuse/shared/src/server";
import { evalConfigsTableCols } from "@/src/server/api/definitions/evalConfigsTable";

describe("eval config orderBy columns", () => {
  it("maps generated score name to job_configurations.score_name", () => {
    const sql = orderByToPrismaSql(
      { column: "scoreName", order: "ASC" },
      evalConfigsTableCols,
    );

    expect(sql.strings.join("")).toContain('jc."score_name" ASC');
  });

  it("rejects columns that are not sortable on this table", () => {
    expect(() =>
      orderByToPrismaSql(
        { column: "totalCost", order: "DESC" },
        evalConfigsTableCols,
      ),
    ).toThrow(InvalidRequestError);
  });
});
