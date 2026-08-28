import { fireEvent, render, screen } from "@testing-library/react";
import {
  cloneElement,
  type KeyboardEventHandler,
  type PointerEventHandler,
  type ReactElement,
  type ReactNode,
} from "react";
import { vi } from "vitest";

import { ExistingDatasetItemsDropdownMenuController } from "@/src/features/datasets/components/ExistingDatasetItemsDropdownMenuController";
import { type RouterOutputs } from "@/src/utils/api";

const { radixKeyDown, radixPointerDown } = vi.hoisted(() => ({
  radixKeyDown: vi.fn(),
  radixPointerDown: vi.fn(),
}));

vi.mock("@/src/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({
    children,
    open,
  }: {
    children: ReactNode;
    open: boolean;
  }) => (
    <div data-testid="dropdown-root" data-open={String(open)}>
      {children}
    </div>
  ),
  DropdownMenuTrigger: ({
    children,
  }: {
    children: ReactElement<{
      "aria-haspopup"?: string;
      onKeyDown?: KeyboardEventHandler;
      onPointerDown?: PointerEventHandler;
    }>;
  }) =>
    cloneElement(children, {
      "aria-haspopup": "menu",
      onKeyDown: radixKeyDown,
      onPointerDown: radixPointerDown,
    }),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    asChild,
    children,
    onSelect,
  }: {
    asChild?: boolean;
    children: ReactNode;
    onSelect?: () => void;
  }) =>
    asChild ? (
      <>{children}</>
    ) : (
      <button type="button" onClick={onSelect}>
        {children}
      </button>
    ),
  DropdownMenuSeparator: () => <hr />,
}));

const datasetItems = [
  {
    id: "dataset-item-id",
    datasetId: "dataset-id",
    datasetName: "Dataset name",
  },
] as RouterOutputs["datasets"]["datasetItemsBasedOnTraceOrObservation"];

function renderController(props: {
  datasetItems: RouterOutputs["datasets"]["datasetItemsBasedOnTraceOrObservation"];
  disabled: boolean;
  onOpenDialog: () => void;
  onButtonClick?: () => void;
}) {
  return render(
    <ExistingDatasetItemsDropdownMenuController
      projectId="project-id"
      datasetItems={props.datasetItems}
      disabled={props.disabled}
      onOpenDialog={props.onOpenDialog}
    >
      {({ Anchor, openDropdown }) => (
        <Anchor>
          <button
            type="button"
            disabled={props.disabled}
            onClick={() => {
              props.onButtonClick?.();

              if (props.datasetItems.length > 0) {
                openDropdown();
                return;
              }

              props.onOpenDialog();
            }}
          >
            Add to datasets
          </button>
        </Anchor>
      )}
    </ExistingDatasetItemsDropdownMenuController>,
  );
}

describe("ExistingDatasetItemsDropdownMenuController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("leaves direct opening to the button when the dropdown is inactive", () => {
    const onOpenDialog = vi.fn();
    const onButtonClick = vi.fn();

    renderController({
      datasetItems: [],
      disabled: false,
      onOpenDialog,
      onButtonClick,
    });
    fireEvent.click(screen.getByRole("button", { name: "Add to datasets" }));

    expect(onButtonClick).toHaveBeenCalledOnce();
    expect(onOpenDialog).toHaveBeenCalledOnce();
    expect(screen.queryByText("Add to more datasets")).not.toBeInTheDocument();
  });

  it("uses the trigger only as an anchor and opens programmatically", () => {
    const onOpenDialog = vi.fn();

    renderController({
      datasetItems,
      disabled: false,
      onOpenDialog,
    });
    const button = screen.getByRole("button", { name: "Add to datasets" });

    expect(button).toHaveAttribute("aria-haspopup", "menu");
    fireEvent.pointerDown(button);
    expect(radixPointerDown).not.toHaveBeenCalled();
    expect(screen.getByTestId("dropdown-root")).toHaveAttribute(
      "data-open",
      "false",
    );

    fireEvent.click(button);

    expect(onOpenDialog).not.toHaveBeenCalled();
    expect(screen.getByTestId("dropdown-root")).toHaveAttribute(
      "data-open",
      "true",
    );
    expect(screen.getByRole("link", { name: "Dataset name" })).toHaveAttribute(
      "href",
      "/project/project-id/datasets/dataset-id/items/dataset-item-id",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Add to more datasets" }),
    );
    expect(onOpenDialog).toHaveBeenCalledOnce();
    expect(screen.getByTestId("dropdown-root")).toHaveAttribute(
      "data-open",
      "false",
    );
  });

  it("opens from ArrowDown without running Radix trigger handlers", () => {
    renderController({
      datasetItems,
      disabled: false,
      onOpenDialog: vi.fn(),
    });

    fireEvent.keyDown(screen.getByRole("button", { name: "Add to datasets" }), {
      key: "ArrowDown",
    });

    expect(radixKeyDown).not.toHaveBeenCalled();
    expect(screen.getByTestId("dropdown-root")).toHaveAttribute(
      "data-open",
      "true",
    );
  });

  it("does not open either overlay when disabled", () => {
    const onOpenDialog = vi.fn();

    renderController({
      datasetItems: [],
      disabled: true,
      onOpenDialog,
    });
    fireEvent.click(screen.getByRole("button", { name: "Add to datasets" }));

    expect(onOpenDialog).not.toHaveBeenCalled();
  });
});
