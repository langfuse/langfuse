import { fireEvent, render, screen } from "@testing-library/react";

import { DateRangeInput } from "./DateRangeInput";

const value = {
  from: "2026-08-31",
  to: "2026-09-07",
};

describe("DateRangeInput", () => {
  it("renders compact bounded date inputs", () => {
    render(
      <DateRangeInput
        value={value}
        min="2026-03-07"
        max="2026-09-07"
        onValueChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Start date")).toHaveAttribute(
      "min",
      "2026-03-07",
    );
    expect(screen.getByLabelText("Start date")).toHaveAttribute(
      "max",
      value.to,
    );
    expect(screen.getByLabelText("End date")).toHaveAttribute(
      "min",
      value.from,
    );
    expect(screen.getByLabelText("End date")).toHaveAttribute(
      "max",
      "2026-09-07",
    );
  });

  it("emits the complete range when either date changes", () => {
    const onValueChange = vi.fn();
    render(<DateRangeInput value={value} onValueChange={onValueChange} />);

    fireEvent.change(screen.getByLabelText("Start date"), {
      target: { value: "2026-08-30" },
    });
    expect(onValueChange).toHaveBeenLastCalledWith({
      from: "2026-08-30",
      to: value.to,
    });

    fireEvent.change(screen.getByLabelText("End date"), {
      target: { value: "2026-09-06" },
    });
    expect(onValueChange).toHaveBeenLastCalledWith({
      from: value.from,
      to: "2026-09-06",
    });
  });
});
