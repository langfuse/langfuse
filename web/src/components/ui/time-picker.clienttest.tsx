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

describe("TimePicker period state", () => {
  it("resets a rejected AM/PM edit to the period represented by the date", () => {
    // The range parent rejects changing an end from 12:00 PM to 12:00 AM.
    const setDate = vi.fn();
    render(<TimePicker date={new Date(2026, 5, 10, 12)} setDate={setDate} />);

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "AM" }));

    expect(setDate).toHaveBeenCalledWith(new Date(2026, 5, 10, 0));
    expect(screen.getByRole("combobox")).toHaveTextContent("PM");
  });
});
