import { act, render } from "@testing-library/react";
import { Confetti } from "@/src/components/ui/confetti";
import { LayerProvider } from "@/src/context/LayerContext/LayerContext";

/** Longest possible piece lifetime, plus a margin. Mirrors TEARDOWN_MS. */
const PAST_TEARDOWN_MS = 5000;

function pieceCount() {
  return document.querySelectorAll('[data-testid="confetti"] > span').length;
}

function passTeardownWindow() {
  act(() => {
    vi.advanceTimersByTime(PAST_TEARDOWN_MS);
  });
}

describe("Confetti", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("plays a burst on mount and removes the pieces once the animation is over", () => {
    render(<Confetti />, { wrapper: LayerProvider });

    expect(pieceCount()).toBeGreaterThan(0);

    passTeardownWindow();

    // Left in the DOM the pieces would keep the compositor busy behind the
    // page for the rest of the session.
    expect(pieceCount()).toBe(0);
  });

  it("does not replay while it stays mounted", () => {
    // The page renders this in two branches and swaps between them when the
    // onboarding state resolves. Re-rendering the same instance must not fire
    // a second burst, otherwise opening the page confettis twice.
    const { rerender } = render(<Confetti />, { wrapper: LayerProvider });
    passTeardownWindow();

    rerender(<Confetti />);

    expect(pieceCount()).toBe(0);
  });

  it("replays when remounted under a new key", () => {
    // How switching project replays the burst: the route does not change, so
    // only a new key remounts the component.
    const { rerender } = render(<Confetti key="project-a" />, {
      wrapper: LayerProvider,
    });
    passTeardownWindow();
    expect(pieceCount()).toBe(0);

    rerender(<Confetti key="project-b" />);

    expect(pieceCount()).toBeGreaterThan(0);
  });

  it("hides the overlay from assistive technology", () => {
    render(<Confetti />, { wrapper: LayerProvider });

    const overlay = document.querySelector('[data-testid="confetti"]');
    expect(overlay).toHaveAttribute("aria-hidden", "true");
  });
});
