/**
 * Radix names a dialog from a Title *element* in the DOM — it looks the id up
 * with `document.getElementById(titleId)` — and logs a `console.error` when
 * there is none. `TitleWarning` has no `NODE_ENV` guard, so that error ships to
 * production as well as dev.
 *
 * The surfaces below show no visible heading, so each carries an `sr-only`
 * title instead of omitting one. Both halves are asserted on purpose: an
 * `aria-label` would give the dialog an accessible name while leaving the
 * warning (and Radix's own title contract) unsatisfied, so a name check alone
 * would not have caught the original bug.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  Sidebar,
  SidebarProvider,
  SidebarTrigger,
} from "@/src/components/ui/sidebar";
import { LayerProvider } from "@/src/context/LayerContext/LayerContext";
import { V4IntroDialog } from "@/src/features/events/components/V4IntroDialog";

vi.mock("next/router", () => ({
  useRouter: () => ({ events: { on: vi.fn(), off: vi.fn() } }),
}));

const TITLE_WARNING = /requires a `?DialogTitle`?/;

let consoleErrors: string[] = [];

beforeEach(() => {
  consoleErrors = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    consoleErrors.push(args.map(String).join(" "));
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function titleWarnings() {
  return consoleErrors.filter((message) => TITLE_WARNING.test(message));
}

describe("V4IntroDialog", () => {
  it("names the dialog even though the design shows no heading", () => {
    render(<V4IntroDialog open onConfirm={vi.fn()} onDismiss={vi.fn()} />, {
      wrapper: LayerProvider,
    });

    expect(
      screen.getByRole("dialog", { name: "Welcome to a faster Langfuse" }),
    ).toBeInTheDocument();
    expect(titleWarnings()).toEqual([]);
  });

  it("keeps the floating close button suppressed", () => {
    render(<V4IntroDialog open onConfirm={vi.fn()} onDismiss={vi.fn()} />, {
      wrapper: LayerProvider,
    });

    // The dialog is dismissed through its footer action. The title is an `h2`,
    // so `[&>div:last-child]:hidden` still resolves to the close wrapper.
    const dialog = screen.getByRole("dialog");
    // DialogContent carries the suppressing class from V4IntroDialog — this
    // is the discriminating assertion: `DialogContent` itself also adds
    // `[&:has(.dialog-header)]:hidden` to the close-wrapper element, so
    // checking the wrapper's own className would pass even without the fix.
    expect(dialog.className).toContain("[&>div:last-child]:hidden");
    // The close wrapper is still the last child (the selector still resolves).
    const closeWrapper = dialog.querySelector(":scope > div:last-child");
    expect(closeWrapper?.querySelector("button")).not.toBeNull();
  });
});

describe("mobile sidebar sheet", () => {
  beforeEach(() => {
    // `useIsMobile` reads `matchMedia` synchronously; jsdom does not ship it.
    vi.stubGlobal("matchMedia", (media: string) => ({
      matches: true,
      media,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });

  it("names the off-canvas navigation sheet", () => {
    render(
      <SidebarProvider>
        <Sidebar>
          <span>Projects</span>
        </Sidebar>
        <SidebarTrigger />
      </SidebarProvider>,
      { wrapper: LayerProvider },
    );

    fireEvent.click(screen.getByRole("button", { name: "Toggle Sidebar" }));

    expect(screen.getByRole("dialog", { name: "Sidebar" })).toBeInTheDocument();
    expect(titleWarnings()).toEqual([]);
  });
});
