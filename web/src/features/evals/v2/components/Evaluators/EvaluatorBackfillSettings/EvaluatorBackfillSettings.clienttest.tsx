import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { EvaluatorBackfillSettings } from "./EvaluatorBackfillSettings";

const range = {
  from: new Date("2026-08-28T00:00:00"),
  to: new Date("2026-09-04T23:59:59.999"),
};

function renderSettings(
  overrides: Partial<ComponentProps<typeof EvaluatorBackfillSettings>> = {},
) {
  const props = {
    enabled: false,
    canEnable: true,
    selectedWindow: "7-days" as const,
    range,
    maxItems: 5_000,
    maxAllowedItems: 25_000,
    matchingObservations: 4_400,
    isEstimating: false,
    onEnabledChange: vi.fn(),
    onWindowChange: vi.fn(),
    onRangeChange: vi.fn(),
    onMaxItemsChange: vi.fn(),
    ...overrides,
  };

  render(<EvaluatorBackfillSettings {...props} />);
  return props;
}

describe("EvaluatorBackfillSettings", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-04T12:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps advanced backfill controls collapsed by default", () => {
    const props = renderSettings();

    expect(
      screen.queryByLabelText("Backfill start date"),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByLabelText("Also apply these filters to past observations"),
    );

    expect(props.onEnabledChange).toHaveBeenCalledWith(true);
  });

  it("shows capped matching observations and six-month custom date bounds", () => {
    const props = renderSettings({
      enabled: true,
      selectedWindow: "custom",
      matchingObservations: 21_420,
    });

    expect(screen.getByText(/capping at 5K, newest first/)).toBeInTheDocument();
    expect(screen.getByLabelText("Backfill start date")).toHaveAttribute(
      "min",
      "2026-03-04",
    );

    fireEvent.change(screen.getByLabelText("Backfill end date"), {
      target: { value: "2026-09-03" },
    });
    expect(props.onRangeChange).toHaveBeenCalledWith({
      from: range.from,
      to: new Date("2026-09-03T23:59:59.999"),
    });
  });

  it("caps the requested maximum at 25,000 observations", () => {
    const props = renderSettings({ enabled: true });

    fireEvent.change(screen.getByLabelText("Max items"), {
      target: { value: "50000" },
    });

    expect(props.onMaxItemsChange).toHaveBeenCalledWith(25_000);
  });
});
