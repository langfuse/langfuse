import { fireEvent, render } from "@testing-library/react";

import { InAppAiAgentButton } from "./in-app-ai-agent-button";

const mocks = vi.hoisted(() => ({
  open: false,
  setOpen: vi.fn(),
  openAssistant: vi.fn().mockReturnValue(true),
}));

vi.mock(
  "@/src/ee/features/in-app-agent/components/InAppAiAgentProvider",
  () => ({
    useCanUseInAppAgent: () => true,
    useInAppAiAgent: () => ({
      open: mocks.open,
      setOpen: mocks.setOpen,
      openAssistant: mocks.openAssistant,
    }),
  }),
);

describe("InAppAiAgentButton", () => {
  beforeEach(() => {
    mocks.open = false;
    mocks.setOpen.mockReset();
    mocks.openAssistant.mockReset().mockReturnValue(true);
  });

  it("toggles the assistant with Cmd/Ctrl+I and leaves other shortcuts alone", () => {
    const { rerender } = render(<InAppAiAgentButton />);

    for (const modifiers of [
      {},
      { metaKey: true, altKey: true },
      { ctrlKey: true, shiftKey: true },
      { metaKey: true, repeat: true },
    ]) {
      const nonShortcut = new KeyboardEvent("keydown", {
        key: "i",
        bubbles: true,
        cancelable: true,
        ...modifiers,
      });
      fireEvent(document, nonShortcut);

      expect(nonShortcut.defaultPrevented).toBe(false);
    }

    expect(mocks.openAssistant).not.toHaveBeenCalled();
    expect(mocks.setOpen).not.toHaveBeenCalled();

    const openShortcut = new KeyboardEvent("keydown", {
      key: "i",
      bubbles: true,
      cancelable: true,
      metaKey: true,
    });
    fireEvent(document, openShortcut);

    expect(openShortcut.defaultPrevented).toBe(true);
    expect(mocks.openAssistant).toHaveBeenCalledWith("keyboard_shortcut");
    expect(mocks.setOpen).not.toHaveBeenCalled();

    mocks.open = true;
    rerender(<InAppAiAgentButton />);

    const closeShortcut = new KeyboardEvent("keydown", {
      key: "i",
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
    });
    fireEvent(document, closeShortcut);

    expect(closeShortcut.defaultPrevented).toBe(true);
    expect(mocks.openAssistant).toHaveBeenCalledTimes(1);
    expect(mocks.setOpen).toHaveBeenCalledWith(false);
  });
});
