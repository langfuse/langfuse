import { fireEvent, render, screen } from "@testing-library/react";

import { Stepper } from "./Stepper";

describe("Stepper", () => {
  it("toggles uncontrolled content while notifying the consumer", () => {
    const onOpenChange = vi.fn();

    render(
      <Stepper
        number={1}
        title="Configure output"
        defaultOpen={false}
        onOpenChange={onOpenChange}
      >
        <div>Score configuration</div>
      </Stepper>,
    );

    fireEvent.click(screen.getByRole("button", { name: /configure output/i }));

    expect(screen.getByText("Score configuration")).toBeInTheDocument();
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });
});
