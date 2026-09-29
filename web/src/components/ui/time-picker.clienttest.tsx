import { fireEvent, render, screen } from "@testing-library/react";
import { TimePicker } from "./time-picker";

vi.mock("./time-picker-input", () => ({
  TimePickerInput: () => null,
}));

vi.mock("./tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  TooltipContent: () => null,
}));

vi.mock("./time-period-select", () => ({
  TimePeriodSelect: ({
    period,
    setPeriod,
    date,
    setDate,
  }: {
    period: string;
    setPeriod: (period: string) => void;
    date: Date;
    setDate: (date: Date) => void;
  }) => (
    <button
      aria-label="period"
      onClick={() => {
        setPeriod("AM");
        setDate(
          new Date(date.getFullYear(), date.getMonth(), date.getDate(), 11),
        );
      }}
    >
      {period}
    </button>
  ),
}));

describe("TimePicker period state", () => {
  it("resets a rejected AM/PM edit to the period represented by the date", () => {
    // The range parent rejects 11:00 AM because its start is 12:00 PM.
    const setDate = vi.fn();
    render(<TimePicker date={new Date(2026, 5, 10, 12)} setDate={setDate} />);

    fireEvent.click(screen.getByRole("button", { name: "period" }));

    expect(setDate).toHaveBeenCalledWith(new Date(2026, 5, 10, 11));
    expect(screen.getByRole("button", { name: "period" })).toHaveTextContent(
      "PM",
    );
  });
});
