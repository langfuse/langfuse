import { fireEvent, render, renderHook, screen } from "@testing-library/react";
import { type ReactNode } from "react";
import {
  clampCustomRowHeightPx,
  getRowHeightIOCharLimit,
  isCompactRowHeight,
  mediumRowHeightPx,
  resolveRowHeightRendering,
  resolveStoredRowHeight,
  RowHeightRenderingProvider,
  useAdjustableRowHeight,
  useBoundRowHeightIO,
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

describe("isCompactRowHeight", () => {
  it("keeps preset Small on one line and Medium and Large expanded", () => {
    expect(isCompactRowHeight("s", "preset")).toBe(true);
    expect(isCompactRowHeight("m", "preset")).toBe(false);
    expect(isCompactRowHeight("l", "preset")).toBe(false);
  });

  it("returns a dragged height to one line once it drops below Medium", () => {
    expect(mediumRowHeightPx()).toBe(96);
    expect(isCompactRowHeight("s", "custom", 48)).toBe(true);
    expect(isCompactRowHeight("l", "custom", 95)).toBe(true);
    expect(isCompactRowHeight("s", "custom", 96)).toBe(false);
    expect(isCompactRowHeight("m", "custom", 208)).toBe(false);
    expect(getRowHeightIOCharLimit("s", "custom", 48)).toBeUndefined();
    expect(getRowHeightIOCharLimit("s", "custom", 96)).toBe(2000);
  });

  it("uses the table's own Medium height when that preset is taller", () => {
    const heights = { s: "h-48", m: "h-64", l: "h-96" } as const;
    expect(mediumRowHeightPx(heights)).toBe(256);
    expect(isCompactRowHeight("s", "custom", 192, heights)).toBe(true);
    expect(isCompactRowHeight("s", "custom", 256, heights)).toBe(false);
    expect(isCompactRowHeight("s", "preset", null, heights)).toBe(true);
    expect(isCompactRowHeight("m", "preset", null, heights)).toBe(false);
  });
});

describe("resolveRowHeightRendering", () => {
  it("maps each preset through its pixel height", () => {
    expect(resolveRowHeightRendering({ preset: "s" })).toEqual({
      heightPx: 28,
      compact: true,
      expandedRead: false,
    });
    expect(resolveRowHeightRendering({ preset: "m" })).toEqual({
      heightPx: 96,
      compact: false,
      expandedRead: true,
    });
    expect(resolveRowHeightRendering({ preset: "l" })).toEqual({
      heightPx: 256,
      compact: false,
      expandedRead: true,
    });
  });

  it("renders a dragged height the same as the preset of that height", () => {
    const medium = resolveRowHeightRendering({ preset: "m" });
    const draggedToMedium = resolveRowHeightRendering({
      preset: "s",
      previewPx: medium.heightPx,
    });
    expect(draggedToMedium).toEqual(medium);

    const small = resolveRowHeightRendering({ preset: "s" });
    const draggedToSmall = resolveRowHeightRendering({
      preset: "l",
      customPx: 256,
      previewPx: small.heightPx,
    });
    expect(draggedToSmall).toEqual(small);
  });

  it("crosses Medium the same way while growing and shrinking", () => {
    expect(
      resolveRowHeightRendering({ preset: "s", previewPx: 95 }).compact,
    ).toBe(true);
    expect(
      resolveRowHeightRendering({ preset: "s", previewPx: 96 }).compact,
    ).toBe(false);
    expect(
      resolveRowHeightRendering({ preset: "l", customPx: 256, previewPx: 95 })
        .compact,
    ).toBe(true);
    expect(getRowHeightIOCharLimit("m", "preset")).toBe(2000);
    expect(getRowHeightIOCharLimit("s", "preset")).toBeUndefined();
  });

  it("uses a table whose Medium preset is not the default 96px", () => {
    const list = { s: "h-24", m: "h-48", l: "h-96" } as const;
    const medium = resolveRowHeightRendering({ preset: "m" }, list);
    expect(medium).toEqual({
      heightPx: 192,
      compact: false,
      expandedRead: true,
    });
    expect(
      resolveRowHeightRendering({ preset: "s", previewPx: 192 }, list),
    ).toEqual(medium);
    expect(
      resolveRowHeightRendering({ preset: "l", previewPx: 191 }, list).compact,
    ).toBe(true);
  });
});

function CompactTable({ children }: { children: ReactNode }) {
  return (
    <RowHeightRenderingProvider compact expandedRead={false}>
      {children}
    </RowHeightRenderingProvider>
  );
}

describe("useBoundRowHeightIO", () => {
  it("follows a compact row by default and keeps singleLine when opted out", () => {
    const following = renderHook(() => useBoundRowHeightIO(true, false, true), {
      wrapper: CompactTable,
    });
    expect(following.result.current).toEqual({
      singleLine: true,
      enableExpandOnHover: true,
    });

    const optedOut = renderHook(() => useBoundRowHeightIO(false, false, true), {
      wrapper: CompactTable,
    });
    expect(optedOut.result.current).toEqual({
      singleLine: false,
      enableExpandOnHover: true,
    });
  });

  it("keeps singleLine outside a data table even when following", () => {
    const { result } = renderHook(() => useBoundRowHeightIO(true, false, true));
    expect(result.current).toEqual({
      singleLine: false,
      enableExpandOnHover: true,
    });
  });
});

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
