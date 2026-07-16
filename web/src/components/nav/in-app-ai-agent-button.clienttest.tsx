import { fireEvent, render } from "@testing-library/react";

import { InAppAiAgentButton } from "./in-app-ai-agent-button";

const mocks = vi.hoisted(() => ({
  resetGeometry: vi.fn(),
  setOpen: vi.fn(),
}));

vi.mock(
  "@/src/ee/features/in-app-agent/components/InAppAiAgentProvider",
  () => ({
    useInAppAiAgent: () => ({
      deleteConversation: vi.fn(),
      isAvailable: true,
      isExpanded: false,
      open: false,
      setIsExpanded: vi.fn(),
      setOpen: mocks.setOpen,
    }),
  }),
);

vi.mock(
  "@/src/ee/features/in-app-agent/components/InAppAgentWindowShell",
  () => ({
    InAppAgentWindowShell: () => null,
    useInAppAgentWindowShellPanelControl: () => ({
      geometry: null,
      initializeGeometry: vi.fn(),
      resetGeometry: mocks.resetGeometry,
    }),
  }),
);

vi.mock("@/src/features/entitlements/hooks", () => ({
  useHasEntitlement: () => true,
}));

vi.mock("@/src/features/organizations/hooks", () => ({
  useLangfuseCloudRegion: () => ({ isLangfuseCloud: true }),
}));

vi.mock("@/src/features/projects/hooks", () => ({
  useQueryProjectOrOrganization: () => ({
    organization: { aiFeaturesEnabled: true },
  }),
}));

describe("InAppAiAgentButton", () => {
  it("opens the assistant with Cmd/Ctrl+I and leaves plain I alone", () => {
    render(<InAppAiAgentButton />);

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

    for (const modifier of [{ metaKey: true }, { ctrlKey: true }]) {
      const shortcut = new KeyboardEvent("keydown", {
        key: "i",
        bubbles: true,
        cancelable: true,
        ...modifier,
      });
      fireEvent(document, shortcut);

      expect(shortcut.defaultPrevented).toBe(true);
    }

    expect(mocks.resetGeometry).toHaveBeenCalledTimes(2);
    expect(mocks.setOpen).toHaveBeenCalledTimes(2);
    expect(mocks.setOpen).toHaveBeenNthCalledWith(1, true);
    expect(mocks.setOpen).toHaveBeenNthCalledWith(2, true);
  });
});
