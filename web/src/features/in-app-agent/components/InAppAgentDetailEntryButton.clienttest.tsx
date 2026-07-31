import { fireEvent, render, screen } from "@testing-library/react";

import { InAppAgentDetailEntryButton } from "./InAppAgentDetailEntryButton";
import { getInAppAgentFocusedQuickActions } from "@/src/features/in-app-agent/quickActions";
import { TooltipProvider } from "@/src/components/ui/tooltip";

const mocks = vi.hoisted(() => ({
  canUse: true,
  open: false,
  setOpen: vi.fn(),
  openAssistant: vi.fn().mockReturnValue(true),
  submit: vi.fn().mockResolvedValue(true),
  isRunning: false,
  isSubmitting: false,
  capture: vi.fn(),
  asPath: "/project/p-1/traces",
}));

vi.mock("next/router", () => ({
  useRouter: () => ({ asPath: mocks.asPath }),
}));

vi.mock("@/src/features/in-app-agent/components/InAppAiAgentProvider", () => ({
  useCanUseInAppAgent: () => mocks.canUse,
  useInAppAiAgent: () => ({
    open: mocks.open,
    setOpen: mocks.setOpen,
    openAssistant: mocks.openAssistant,
    submit: mocks.submit,
    isRunning: mocks.isRunning,
    isSubmitting: mocks.isSubmitting,
  }),
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => mocks.capture,
}));

function renderButton(showLabel?: boolean) {
  return render(
    <TooltipProvider>
      <InAppAgentDetailEntryButton showLabel={showLabel} />
    </TooltipProvider>,
  );
}

function mountOverlayLayers() {
  // Overlay layer containers are required for DropdownMenu portals in jsdom
  // (same structure as `_document.tsx`).
  const overlayRoot = document.createElement("div");
  overlayRoot.setAttribute("data-overlay-root", "");
  for (const name of [
    "panel",
    "agent",
    "modal",
    "popover",
    "tooltip",
    "toast",
  ]) {
    const layer = document.createElement("div");
    layer.setAttribute("data-layer", name);
    overlayRoot.appendChild(layer);
  }
  document.body.appendChild(overlayRoot);
  return overlayRoot;
}

describe("InAppAgentDetailEntryButton", () => {
  beforeEach(() => {
    mocks.canUse = true;
    mocks.open = false;
    mocks.isRunning = false;
    mocks.isSubmitting = false;
    mocks.setOpen.mockReset();
    mocks.openAssistant.mockReset().mockReturnValue(true);
    mocks.submit.mockReset().mockResolvedValue(true);
    mocks.capture.mockReset();
  });

  it("renders nothing when the assistant is unavailable", () => {
    mocks.canUse = false;
    const { container } = renderButton();

    expect(container).toBeEmptyDOMElement();
  });

  it("opens the assistant from the detail header entry point", () => {
    renderButton();

    fireEvent.click(screen.getByRole("button", { name: "Open assistant" }));

    expect(mocks.openAssistant).toHaveBeenCalledWith("detail_header");
    expect(mocks.setOpen).not.toHaveBeenCalled();
  });

  it("keeps the open control reachable in icon-only mode", () => {
    renderButton(false);

    expect(
      screen.getByRole("button", { name: "Open assistant" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Assistant quick actions" }),
    ).toBeInTheDocument();
  });

  it("closes the assistant when it is already open", () => {
    mocks.open = true;
    renderButton();

    fireEvent.click(screen.getByRole("button", { name: "Close assistant" }));

    expect(mocks.setOpen).toHaveBeenCalledWith(false);
    expect(mocks.openAssistant).not.toHaveBeenCalled();
  });

  it("opens the assistant and submits when a quick action is chosen", async () => {
    const overlayRoot = mountOverlayLayers();
    const [focusedAction] = getInAppAgentFocusedQuickActions("trace") ?? [];
    if (!focusedAction) {
      throw new Error("expected a focused trace quick action");
    }

    renderButton();

    const trigger = screen.getByRole("button", {
      name: "Assistant quick actions",
    });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Enter" });

    fireEvent.click(
      await screen.findByRole("menuitem", {
        name: new RegExp(focusedAction.label),
      }),
    );

    expect(mocks.openAssistant).toHaveBeenCalledWith("detail_header");
    expect(mocks.submit).toHaveBeenCalledWith(focusedAction.prompt, {
      quickAction: {
        key: focusedAction.id,
        category: "observability",
      },
    });
    expect(mocks.capture).toHaveBeenCalledWith(
      "in_app_agent:quick_action_started",
      expect.objectContaining({
        quickActionKey: focusedAction.id,
        position: 0,
      }),
    );

    overlayRoot.remove();
  });

  it("does not submit a quick action while the assistant is running", async () => {
    const overlayRoot = mountOverlayLayers();
    mocks.isRunning = true;
    const [focusedAction] = getInAppAgentFocusedQuickActions("trace") ?? [];
    if (!focusedAction) {
      throw new Error("expected a focused trace quick action");
    }

    renderButton();

    const trigger = screen.getByRole("button", {
      name: "Assistant quick actions",
    });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Enter" });

    fireEvent.click(
      await screen.findByRole("menuitem", {
        name: new RegExp(focusedAction.label),
      }),
    );

    expect(mocks.openAssistant).not.toHaveBeenCalled();
    expect(mocks.submit).not.toHaveBeenCalled();

    overlayRoot.remove();
  });
});
