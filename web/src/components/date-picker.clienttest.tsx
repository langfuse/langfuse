import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { type DateRange } from "react-day-picker";
import { Calendar } from "@/src/components/ui/calendar";
import {
  isRangeWithinMaxDuration,
  nextRangeForDayClick,
} from "@/src/components/date-picker";
import { setBeginningOfDay, setEndOfDay } from "@/src/utils/dates";

/**
 * Regression coverage for LFE-8156. The range calendar used to feel "sticky":
 * with a range already selected, a single click extended that range (the click
 * became the end of the OLD range) instead of starting a new one. The pickers
 * now drive selection from the clicked day via `nextRangeForDayClick` so the
 * first click always starts a fresh range and the second sets the end —
 * avoiding react-day-picker's edge behaviours (extend-complete-range,
 * clear-on-same-day-click) entirely.
 */
describe("nextRangeForDayClick (LFE-8156)", () => {
  const jun = (d: number) => new Date(2026, 5, d);

  it("starts a fresh range when there is no current selection", () => {
    expect(nextRangeForDayClick(undefined, jun(10))).toEqual({
      from: jun(10),
      to: undefined,
    });
  });

  it("starts a fresh range (first click) when a complete range exists", () => {
    expect(
      nextRangeForDayClick({ from: jun(18), to: jun(25) }, jun(10)),
    ).toEqual({ from: jun(10), to: undefined });
  });

  it("starts a fresh range when re-clicking the single day of a same-day range (does not clear)", () => {
    // A short preset (e.g. Past 1 hour) leaves from/to on the same calendar day.
    // react-day-picker's resetOnSelect would clear the selection here; we must
    // start a new range at the clicked day instead.
    expect(
      nextRangeForDayClick({ from: jun(25), to: jun(25) }, jun(25)),
    ).toEqual({ from: jun(25), to: undefined });
  });

  it("sets the end on the second click", () => {
    expect(
      nextRangeForDayClick({ from: jun(10), to: undefined }, jun(20)),
    ).toEqual({ from: jun(10), to: jun(20) });
  });

  it("swaps when the second click lands before the start", () => {
    expect(
      nextRangeForDayClick({ from: jun(20), to: undefined }, jun(10)),
    ).toEqual({ from: jun(10), to: jun(20) });
  });
});

describe("isRangeWithinMaxDuration", () => {
  const maxThirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  it("allows a range up to the configured maximum duration", () => {
    expect(
      isRangeWithinMaxDuration(
        {
          from: setBeginningOfDay(new Date(2026, 5, 1)),
          to: setEndOfDay(new Date(2026, 5, 30)),
        },
        maxThirtyDaysMs,
      ),
    ).toBe(true);
  });

  it("rejects a range longer than the configured maximum duration", () => {
    expect(
      isRangeWithinMaxDuration(
        {
          from: setBeginningOfDay(new Date(2026, 5, 1)),
          to: setEndOfDay(new Date(2026, 6, 1)),
        },
        maxThirtyDaysMs,
      ),
    ).toBe(false);
  });
});

/**
 * Integration: drive the real calendar exactly as the pickers do — compute the
 * next range from the clicked day and "commit" (write URL / form) only once
 * both ends are set.
 */
function RangeCalendarHarness({
  initial,
  onCommit,
}: {
  initial: DateRange;
  onCommit: (range: { from: Date; to: Date }) => void;
}) {
  const [range, setRange] = useState<DateRange | undefined>(initial);
  return (
    <Calendar
      mode="range"
      defaultMonth={new Date(2026, 5, 1)}
      selected={range}
      onSelect={(_, triggerDay) => {
        if (!triggerDay) return;
        const next = nextRangeForDayClick(range, triggerDay);
        setRange(next);
        if (next.from && next.to) {
          onCommit({ from: next.from, to: next.to });
        }
      }}
    />
  );
}

const clickDay = (name: RegExp) =>
  fireEvent.click(screen.getByRole("button", { name }));

const ariaOf = (name: RegExp) =>
  screen.getByRole("button", { name }).getAttribute("aria-label") ?? "";

describe("range calendar first-click selection (LFE-8156)", () => {
  it("first click starts fresh (no commit); second click commits the user's two days", () => {
    const onCommit = vi.fn();
    render(
      <RangeCalendarHarness
        initial={{ from: new Date(2026, 5, 18), to: new Date(2026, 5, 25) }}
        onCommit={onCommit}
      />,
    );

    // First click = Start: previous range cleared, nothing committed yet.
    clickDay(/June 10th, 2026/);
    expect(onCommit).not.toHaveBeenCalled();
    expect(ariaOf(/June 10th, 2026/)).toContain("selected");
    // The stale Jun 25 end is no longer part of the selection.
    expect(ariaOf(/June 25th, 2026/)).not.toContain("selected");

    // Second click = End: commits Jun 10 – Jun 20, not the stale Jun 25.
    clickDay(/June 20th, 2026/);
    expect(onCommit).toHaveBeenCalledTimes(1);
    const committed = onCommit.mock.calls[0][0];
    expect(committed.from.getDate()).toBe(10);
    expect(committed.to.getDate()).toBe(20);
  });

  it("re-clicking the only day of a same-day range starts a new range instead of clearing it", () => {
    const onCommit = vi.fn();
    render(
      <RangeCalendarHarness
        initial={{ from: new Date(2026, 5, 25), to: new Date(2026, 5, 25) }}
        onCommit={onCommit}
      />,
    );

    // Clicking the single selected day must keep it selected as the new start,
    // not wipe the highlight (the react-day-picker resetOnSelect trap).
    clickDay(/June 25th, 2026/);
    expect(onCommit).not.toHaveBeenCalled();
    expect(ariaOf(/June 25th, 2026/)).toContain("selected");

    // Second click before the start swaps into a valid range.
    clickDay(/June 20th, 2026/);
    expect(onCommit).toHaveBeenCalledTimes(1);
    const committed = onCommit.mock.calls[0][0];
    expect(committed.from.getDate()).toBe(20);
    expect(committed.to.getDate()).toBe(25);
  });
});
