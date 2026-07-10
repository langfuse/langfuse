import { BatchTableNames } from "@langfuse/shared";
import { getBatchExportWarningMessage } from "@/src/components/BatchExportTableButton";

describe("getBatchExportWarningMessage", () => {
  it("does not warn that Events comment filters are ignored", () => {
    expect(getBatchExportWarningMessage(BatchTableNames.Events)).toBeNull();
  });

  it("retains warnings for exports that still drop filters", () => {
    expect(getBatchExportWarningMessage(BatchTableNames.Traces)).toContain(
      "Comments are not included in trace exports",
    );
    expect(getBatchExportWarningMessage(BatchTableNames.Sessions)).toContain(
      "Comments are not included in session exports",
    );
  });
});
