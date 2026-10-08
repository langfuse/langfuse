import { fireEvent, render, screen } from "@testing-library/react";
import {
  clampCustomRowHeightPx,
  resolveStoredRowHeight,
  useAdjustableRowHeight,
} from "@/src/components/table/data-table-row-height-switch";

const STORAGE_KEY = "experiment-items-compactHeight";

describe("resolveStoredRowHeight", () => {
  it("keeps a previously saved preset string", () => {
    expect(resolveStoredRowHeight("l", "s")).toEqual({
      preset: "l",
      mode: "preset",
      customPx: null,
    });
  });

  it("restores a free height without dropping the preset it replaced", () => {
    expect(
      resolveStoredRowHeight(
        { preset: "m", mode: "custom", customPx: 640 },
        "s",
      ),
    ).toEqual({ preset: "m", mode: "custom", customPx: 640 });
  });

  it("falls back when the stored value cannot be a height", () => {
    expect(resolveStoredRowHeight({ mode: "custom" }, "s")).toEqual({
      preset: "s",
      mode: "preset",
      customPx: null,
    });
    expect(resolveStoredRowHeight("tall", "m")).toEqual({
      preset: "m",
      mode: "preset",
      customPx: null,
    });
  });

  it("clamps a free height into the supported range", () => {
    expect(clampCustomRowHeightPx(10)).toBe(48);
    expect(clampCustomRowHeightPx(9000)).toBe(4000);
    expect(
      resolveStoredRowHeight({ preset: "s", mode: "custom", customPx: 12 }, "s")
        .customPx,
    ).toBe(48);
  });
});

function HeightHarness() {
  const height = useAdjustableRowHeight("experiment-items-compact", "s");
  return (
    <div>
      <span data-testid="mode">{height.mode}</span>
      <span data-testid="preset">{height.preset}</span>
      <span data-testid="px">{height.activeHeightPx ?? "none"}</span>
      <button type="button" onClick={() => height.setCustomPx(800)}>
        drag
      </button>
      <button type="button" onClick={() => height.setPreset("m")}>
        medium
      </button>
      <button type="button" onClick={() => height.selectCustom()}>
        custom
      </button>
    </div>
  );
}

describe("useAdjustableRowHeight", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("loads a legacy preset and remembers a dragged height across preset changes", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify("l"));
    render(<HeightHarness />);

    expect(screen.getByTestId("mode")).toHaveTextContent("preset");
    expect(screen.getByTestId("preset")).toHaveTextContent("l");
    expect(screen.getByTestId("px")).toHaveTextContent("none");

    fireEvent.click(screen.getByRole("button", { name: "drag" }));
    expect(screen.getByTestId("mode")).toHaveTextContent("custom");
    expect(screen.getByTestId("px")).toHaveTextContent("800");
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "")).toEqual({
      preset: "l",
      mode: "custom",
      customPx: 800,
    });

    fireEvent.click(screen.getByRole("button", { name: "medium" }));
    expect(screen.getByTestId("mode")).toHaveTextContent("preset");
    expect(screen.getByTestId("preset")).toHaveTextContent("m");
    expect(screen.getByTestId("px")).toHaveTextContent("none");

    fireEvent.click(screen.getByRole("button", { name: "custom" }));
    expect(screen.getByTestId("mode")).toHaveTextContent("custom");
    expect(screen.getByTestId("preset")).toHaveTextContent("m");
    expect(screen.getByTestId("px")).toHaveTextContent("800");
  });
});
