import { renderHook } from "@testing-library/react";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import useColumnVisibility from "./useColumnVisibility";

const columns: LangfuseColumnDef<{ id: string }>[] = [
  { accessorKey: "name", header: "Name", enableHiding: true },
  {
    accessorKey: "input",
    header: "Input",
    enableHiding: true,
    defaultHidden: true,
  },
];

describe("useColumnVisibility", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // A column ORDER (a list of ids) under a visibility key is what a key shared
  // between useColumnVisibility and useColumnOrder used to leave behind. Read
  // back as a visibility map it carried no visibility at all.
  it("falls back to the column defaults when the stored value is an array", () => {
    localStorage.setItem("visibilityKey", JSON.stringify(["name", "input"]));

    const { result } = renderHook(() =>
      useColumnVisibility("visibilityKey", columns),
    );

    expect(result.current[0]).toEqual({ name: true, input: false });
  });

  // What the affected browsers actually hold: toggling a column while the
  // visibility state was a column-order array spread that array into the
  // object (`{...["name","input"]}`). Those entries are not visibility, and
  // nothing else prunes them — a saved view rejects them permanently.
  it("drops entries whose value is not a boolean and rewrites the key", () => {
    localStorage.setItem(
      "visibilityKey",
      JSON.stringify({ "0": "name", "1": "input", input: false }),
    );

    const { result } = renderHook(() =>
      useColumnVisibility("visibilityKey", columns),
    );

    expect(result.current[0]).toEqual({ name: true, input: false });
    expect(JSON.parse(localStorage.getItem("visibilityKey") ?? "null")).toEqual(
      {
        name: true,
        input: false,
      },
    );
  });

  // A known column whose stored value is not a boolean must not be copied back
  // into the repaired state — only boolean preferences survive.
  it("ignores non-boolean values for known columns when repairing", () => {
    localStorage.setItem(
      "visibilityKey",
      JSON.stringify({ name: "name", input: false }),
    );

    const { result } = renderHook(() =>
      useColumnVisibility("visibilityKey", columns),
    );

    expect(result.current[0]).toEqual({ name: true, input: false });
    expect(JSON.parse(localStorage.getItem("visibilityKey") ?? "null")).toEqual(
      {
        name: true,
        input: false,
      },
    );
  });
});
