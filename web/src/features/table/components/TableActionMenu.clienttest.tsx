import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import {
  ActionId,
  BatchActionType,
  BatchExportTableName,
} from "@langfuse/shared";
import { TooltipProvider } from "@/src/components/ui/tooltip";
import { type CustomDialogTableAction } from "@/src/features/table/types";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    hasAccess: true,
    hasEntitlement: true,
  },
}));

vi.mock("@/src/features/rbac", () => ({
  useHasProjectAccess: () => mocks.hasAccess,
}));

vi.mock("@/src/features/entitlements", () => ({
  useOptionalEntitlement: () => mocks.hasEntitlement,
}));

vi.mock("@/src/features/table/components/TableActionDialog", () => ({
  TableActionDialog: () => null,
}));

import { TableActionMenu } from "@/src/features/table/components/TableActionMenu";

const queueAction = {
  id: ActionId.TraceAddToAnnotationQueue,
  type: BatchActionType.Create,
  label: "Add to Annotation Queue",
  description: "Add selected traces to an annotation queue.",
  customDialog: true,
  accessCheck: {
    scope: "annotationQueues:CUD",
  },
} satisfies CustomDialogTableAction;

function renderMenu(
  onCustomAction: (actionType: CustomDialogTableAction["id"]) => void = vi.fn(),
) {
  return render(
    <TooltipProvider>
      <TableActionMenu
        projectId="project-1"
        actions={[queueAction]}
        tableName={BatchExportTableName.Traces}
        selectedCount={2}
        onClearSelection={vi.fn()}
        onCustomAction={onCustomAction}
      />
    </TooltipProvider>,
  );
}

describe("TableActionMenu access gating", () => {
  beforeEach(() => {
    mocks.hasAccess = true;
    mocks.hasEntitlement = true;
  });

  it("does not open a custom dialog when the user lacks project access", () => {
    mocks.hasAccess = false;
    const onCustomAction = vi.fn();
    renderMenu(onCustomAction);

    const button = screen.getByRole("button", {
      name: "Add to Annotation Queue",
    });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onCustomAction).not.toHaveBeenCalled();
  });

  it("does not open a custom dialog when the plan lacks the entitlement", () => {
    mocks.hasEntitlement = false;
    const onCustomAction = vi.fn();
    renderMenu(onCustomAction);

    const button = screen.getByRole("button", {
      name: "Add to Annotation Queue",
    });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onCustomAction).not.toHaveBeenCalled();
  });

  it("opens a custom dialog when the user has project access", () => {
    const onCustomAction = vi.fn();
    renderMenu(onCustomAction);

    fireEvent.click(
      screen.getByRole("button", { name: "Add to Annotation Queue" }),
    );
    expect(onCustomAction).toHaveBeenCalledWith(
      ActionId.TraceAddToAnnotationQueue,
    );
  });
});
