import { fireEvent, render, screen } from "@testing-library/react";

import { Button } from "@/src/components/ui/button";
import { PopoverTrigger } from "@/src/components/ui/popover";
import { JudgeModelPicker } from "./JudgeModelPicker";

const baseProps = {
  open: true,
  mode: "default" as const,
  defaultModel: null,
  providerGroups: [],
  selectedModel: null,
  onModeChange: vi.fn(),
  onSelectCustom: vi.fn(),
};

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

describe("JudgeModelPicker", () => {
  it.each([
    ["Configure AI providers", "providers"],
    ["Set a project default", "default"],
  ])("closes before opening %s configuration", (buttonName, callback) => {
    const onOpenChange = vi.fn();
    const onConfigureProviders = vi.fn();
    const onConfigureDefault = vi.fn();

    render(
      <JudgeModelPicker
        {...baseProps}
        onOpenChange={onOpenChange}
        onConfigureProviders={onConfigureProviders}
        onConfigureDefault={onConfigureDefault}
      >
        <PopoverTrigger asChild>
          <Button type="button">Select model</Button>
        </PopoverTrigger>
      </JudgeModelPicker>,
    );

    fireEvent.click(screen.getByRole("button", { name: buttonName }));

    const configureCallback =
      callback === "providers" ? onConfigureProviders : onConfigureDefault;
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(configureCallback).toHaveBeenCalledOnce();
    expect(onOpenChange.mock.invocationCallOrder[0]).toBeLessThan(
      configureCallback.mock.invocationCallOrder[0],
    );
  });
});
