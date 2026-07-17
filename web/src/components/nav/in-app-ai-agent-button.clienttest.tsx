import { fireEvent, render } from "@testing-library/react";

import { InAppAiAgentButton } from "./in-app-ai-agent-button";

const mocks = vi.hoisted(() => ({
  open: false,
  setOpen: vi.fn(),
}));

vi.mock(
  "@/src/ee/features/in-app-agent/components/InAppAiAgentProvider",
  () => ({
    useCanUseInAppAgent: () => true,
    useInAppAiAgent: () => ({
      open: mocks.open,
      setOpen: mocks.setOpen,
    }),
  }),
);

vi.mock("@/src/features/projects/hooks", () => ({
  useQueryProjectOrOrganization: () => ({
    organization: { aiFeaturesEnabled: true },
  }),
}));

describe("InAppAiAgentButton", () => {
  beforeEach(() => {
    mocks.open = false;
    mocks.setOpen.mockReset();
  });

  it("toggles the assistant with Cmd/Ctrl+I and leaves other shortcuts alone", () => {
    const { rerender } = render(<InAppAiAgentButton />);

    for (const modifiers of [
      {},
      { metaKey: true, altKey: true },
      { ctrlKey: true, shiftKey: true },
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

    expect(mocks.setOpen).not.toHaveBeenCalled();

    const openShortcut = new KeyboardEvent("keydown", {
      key: "i",
      bubbles: true,
      cancelable: true,
      metaKey: true,
    });
    fireEvent(document, openShortcut);

    expect(openShortcut.defaultPrevented).toBe(true);
    expect(mocks.setOpen).toHaveBeenCalledWith(true);

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
    expect(mocks.setOpen).toHaveBeenCalledTimes(2);
    expect(mocks.setOpen).toHaveBeenNthCalledWith(1, true);
    expect(mocks.setOpen).toHaveBeenNthCalledWith(2, false);
  });
});
