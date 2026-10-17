import { fireEvent, render, screen } from "@testing-library/react";
import { DatePickerWithRange, TimeRangePicker } from "./date-picker";
import { DASHBOARD_AGGREGATION_PLACEHOLDER } from "@/src/utils/date-range-utils";

vi.mock("@/src/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("@/src/components/ui/calendar", () => ({
  Calendar: () => null,
}));

vi.mock("@/src/components/date-range-dropdowns", () => ({
  DashboardDateRangeDropdown: () => null,
}));

vi.mock("@/src/components/ui/time-picker", () => ({
  TimePicker: ({
    date,
    setDate,
  }: {
    date: Date;
    setDate: (date: Date) => void;
  }) => (
    <button
      onClick={() =>
        setDate(new Date(2026, 5, 10, date.getHours() === 12 ? 14 : 11))
      }
    >
      Invalid {date.getHours() === 12 ? "start" : "end"}
    </button>
  ),
}));

const from = new Date(2026, 5, 10, 12);
const to = new Date(2026, 5, 10, 13);

describe("manual time edits", () => {
  it.each(["start", "end"])(
    "keeps DatePickerWithRange's last valid range when %s crosses the other boundary",
    (boundary) => {
      const onChange = vi.fn();
      render(
        <DatePickerWithRange
          dateRange={{ from, to }}
          selectedOption={DASHBOARD_AGGREGATION_PLACEHOLDER}
          setDateRangeAndOption={onChange}
        />,
      );

      fireEvent.click(
        screen.getByRole("button", { name: `Invalid ${boundary}` }),
      );

      expect(onChange).not.toHaveBeenCalled();
      expect(
        screen.getByRole("button", { name: "Invalid start" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Invalid end" }),
      ).toBeInTheDocument();
    },
  );

  it.each(["start", "end"])(
    "keeps TimeRangePicker's last valid range when %s crosses the other boundary",
    (boundary) => {
      const onChange = vi.fn();
      render(
        <TimeRangePicker
          timeRange={{ from, to }}
          timeRangePresets={[]}
          onTimeRangeChange={onChange}
          maxRangeMs={24 * 60 * 60 * 1000}
        />,
      );
      fireEvent.click(screen.getByText("Select from calendar"));

      fireEvent.click(
        screen.getByRole("button", { name: `Invalid ${boundary}` }),
      );

      expect(onChange).not.toHaveBeenCalled();
      expect(
        screen.getByRole("button", { name: "Invalid start" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Invalid end" }),
      ).toBeInTheDocument();
    },
  );
});
