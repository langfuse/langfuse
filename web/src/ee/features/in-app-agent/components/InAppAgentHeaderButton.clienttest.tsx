import { fireEvent, render, screen } from "@testing-library/react";

import { TooltipProvider } from "@/src/components/ui/tooltip";
import { InAppAgentHeaderButton } from "./InAppAgentHeaderButton";

const openAssistant = vi.fn();

vi.mock("./InAppAiAgentProvider", () => ({
  useInAppAiAgent: () => ({
    isAvailable: true,
    open: false,
    openAssistant,
  }),
}));

describe("InAppAgentHeaderButton", () => {
  it("opens the assistant from the page header", () => {
    render(
      <TooltipProvider>
        <InAppAgentHeaderButton />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open assistant" }));

    expect(openAssistant).toHaveBeenCalledOnce();
    expect(openAssistant).toHaveBeenCalledWith("page_header");
  });
});
