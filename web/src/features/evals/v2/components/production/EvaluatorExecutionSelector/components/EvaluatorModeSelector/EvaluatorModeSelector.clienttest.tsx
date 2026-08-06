import { render, screen, waitFor } from "@testing-library/react";

import { EvaluatorModeSelector } from "./EvaluatorModeSelector";

describe("EvaluatorModeSelector", () => {
  beforeAll(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  it("centers the selected background within the bordered control", async () => {
    render(
      <EvaluatorModeSelector value="llm" onValueChange={() => undefined} />,
    );

    const tabList = screen.getByRole("tablist");
    await waitFor(() =>
      expect(tabList.querySelector("span[aria-hidden]")).not.toBeNull(),
    );

    expect(tabList.querySelector("span[aria-hidden]")).toHaveClass(
      "top-1/2",
      "-translate-y-1/2",
    );
  });
});
