import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { type DateRange } from "react-day-picker";
import { Calendar } from "@/src/components/ui/calendar";

/**
 * Regression coverage for LFE-8156 — the range calendar used to feel "sticky":
 * with a complete range already selected, a single click extended that range
 * (the clicked day became the end of the OLD range) instead of starting a new
 * one. The pickers in `date-picker.tsx` (`DatePickerWithRange`, `TimeRangePicker`)
 * pass `resetOnSelect` so the first click always starts a fresh range and only
 * the second click sets the end.
 *
 * The harness mirrors how those pickers drive react-day-picker: it holds the
 * in-progress range and "commits" (the moment a real picker writes to the URL /
 * form) only once both ends are set.
 */
function RangeCalendarHarness({
  initial,
  resetOnSelect,
  onCommit,
}: {
  initial: DateRange;
  resetOnSelect: boolean;
  onCommit: (range: { from: Date; to: Date }) => void;
}) {
  const [range, setRange] = useState<DateRange | undefined>(initial);
  return (
    <Calendar
      mode="range"
      defaultMonth={new Date(2026, 5, 1)}
      selected={range}
      resetOnSelect={resetOnSelect}
      onSelect={(next) => {
        setRange(next);
        if (next?.from && next?.to) {
          onCommit({ from: next.from, to: next.to });
        }
      }}
    />
  );
}

const clickDay = (name: RegExp) =>
  fireEvent.click(screen.getByRole("button", { name }));

describe("range calendar first-click selection (LFE-8156)", () => {
  // A complete range, as left behind by a preset or a prior custom selection.
  const completeRange = {
    from: new Date(2026, 5, 18),
    to: new Date(2026, 5, 25),
  };

  it("without resetOnSelect, one click extends the existing range — the sticky bug", () => {
    const onCommit = vi.fn();
    render(
      <RangeCalendarHarness
        initial={completeRange}
        resetOnSelect={false}
        onCommit={onCommit}
      />,
    );

    // A single click on Jun 10 should have started a new range, but the old
    // default keeps the stale Jun 25 end and commits Jun 10–25 immediately.
    clickDay(/June 10th, 2026/);
    expect(onCommit).toHaveBeenCalledTimes(1);
    const committed = onCommit.mock.calls[0][0];
    expect(committed.from.getDate()).toBe(10);
    expect(committed.to.getDate()).toBe(25);
  });

  it("with resetOnSelect, the first click starts a fresh range and only the second click commits", () => {
    const onCommit = vi.fn();
    render(
      <RangeCalendarHarness
        initial={completeRange}
        resetOnSelect
        onCommit={onCommit}
      />,
    );

    // First click = Start: previous range is cleared, nothing committed yet.
    clickDay(/June 10th, 2026/);
    expect(onCommit).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /June 10th, 2026/ }),
    ).toHaveAttribute("aria-label", expect.stringContaining("selected"));
    // The stale Jun 25 end is no longer part of the selection.
    expect(
      screen
        .getByRole("button", { name: /June 25th, 2026/ })
        .getAttribute("aria-label"),
    ).not.toContain("selected");

    // Second click = End: commits the user's two clicks (Jun 10–20), not the
    // stale Jun 25 boundary.
    clickDay(/June 20th, 2026/);
    expect(onCommit).toHaveBeenCalledTimes(1);
    const committed = onCommit.mock.calls[0][0];
    expect(committed.from.getDate()).toBe(10);
    expect(committed.to.getDate()).toBe(20);
  });
});
