import { render, screen } from "@testing-library/react";
import {
  ActionId,
  BatchActionType,
  BatchExportTableName,
} from "@langfuse/shared";

import { TableActionMenu } from "./TableActionMenu";

describe("TableActionMenu", () => {
  it("renders custom actions after the standard table actions", () => {
    render(
      <TableActionMenu
        projectId="project-1"
        tableName={BatchExportTableName.Traces}
        selectedCount={2}
        onClearSelection={() => undefined}
        actions={[
          {
            id: ActionId.TraceDelete,
            type: BatchActionType.Delete,
            label: "Delete Traces",
            description: "Delete selected traces",
            accessCheck: { scope: "trace:delete" },
            execute: async () => undefined,
          },
        ]}
      >
        <button>Analyze with Assistant</button>
      </TableActionMenu>,
    );

    const actions = screen.getAllByRole("button");
    expect(
      actions.indexOf(screen.getByRole("button", { name: "Delete Traces" })),
    ).toBeLessThan(
      actions.indexOf(
        screen.getByRole("button", { name: "Analyze with Assistant" }),
      ),
    );
  });
});
