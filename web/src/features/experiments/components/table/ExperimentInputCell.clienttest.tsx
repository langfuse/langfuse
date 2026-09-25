import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExperimentInputCell } from "./ExperimentInputCell";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/router", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/src/components/table/ConnectedIOTableCell", () => ({
  ConnectedIOTableCell: () => (
    <div>
      <span>Input content</span>
      <button type="button">Expand JSON</button>
    </div>
  ),
}));

const href = "/project/project/datasets/dataset/items/item%2Fid";
const renderCell = (datasetId: string | null = "dataset") => {
  const onPeek = vi.fn();
  render(
    <div onClick={onPeek}>
      <ExperimentInputCell
        projectId="project"
        datasetId={datasetId}
        itemId="item/id"
        input="input"
        isLoading={false}
        singleLine={false}
      />
    </div>,
  );
  return onPeek;
};

describe("ExperimentInputCell", () => {
  beforeEach(() => push.mockReset());

  it("opens the dataset item from the cell without opening the row peek", () => {
    const onPeek = renderCell();
    fireEvent.click(screen.getByText("Input content"));
    expect(push).toHaveBeenCalledWith(href);
    expect(onPeek).not.toHaveBeenCalled();
    expect(
      screen.getByRole("link", { name: "Open dataset item" }),
    ).toHaveAttribute("href", href);
  });

  it("supports opening the cell in a new tab with a modifier", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const onPeek = renderCell();
    fireEvent.click(screen.getByText("Input content"), { metaKey: true });
    expect(open).toHaveBeenCalledWith(href, "_blank", "noopener,noreferrer");
    expect(push).not.toHaveBeenCalled();
    expect(onPeek).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it("does not create an invalid link when the dataset is unknown", () => {
    const onPeek = renderCell(null);
    fireEvent.click(screen.getByText("Input content"));
    expect(screen.queryByRole("link")).toBeNull();
    expect(push).not.toHaveBeenCalled();
    expect(onPeek).not.toHaveBeenCalled();
  });

  it("keeps JSON controls interactive without navigation or peek", () => {
    const onPeek = renderCell();
    fireEvent.click(screen.getByRole("button", { name: "Expand JSON" }));
    expect(push).not.toHaveBeenCalled();
    expect(onPeek).not.toHaveBeenCalled();
  });
});
