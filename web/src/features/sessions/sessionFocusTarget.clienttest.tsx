import { act, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { type Virtualizer } from "@tanstack/react-virtual";

import {
  type SessionFocusTarget,
  useScrollToFocusedSessionTrace,
} from "./sessionFocusTarget";

// The trace -> session link lands the session feed on the trace the user came
// from by pinning a frame loop on that row until the rows above it stop
// resizing. The loop is cancelled on unmount, and the feed does get unmounted
// while it is still aligning: React StrictMode remounts every component once
// in development, and the feed is re-created when the view id lands in the URL
// on a cold load. The focus target must survive that, or the list stays at the
// top with the focused trace far below the fold.

const TRACE_IDS = ["t1", "t2", "t3"];
const FOCUS_TARGET = { traceId: "t3", observationId: null };
const TARGET_OFFSET = 2000;

function createFakeFeed() {
  const scroller = {
    clientHeight: 800,
    scrollTop: 0,
    getBoundingClientRect: () => ({ top: 0, height: 800 }) as DOMRect,
    // The row sits TARGET_OFFSET below the top of the scrollable content.
    querySelector: () =>
      ({
        getBoundingClientRect: () =>
          ({ top: TARGET_OFFSET - scroller.scrollTop, height: 400 }) as DOMRect,
      }) as unknown as HTMLElement,
    scrollTo: ({ top }: ScrollToOptions) => {
      scroller.scrollTop = top ?? scroller.scrollTop;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  const virtualizer = {
    scrollElement: scroller,
    options: { getScrollElement: () => scroller },
    getOffsetForIndex: () => [TARGET_OFFSET, "start"],
  } as unknown as Virtualizer<HTMLDivElement, Element>;

  return { scroller, virtualizer };
}

/** The pin loop runs on animation frames; let a few of them through. */
const runFrames = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

describe("useScrollToFocusedSessionTrace", () => {
  it("scrolls the feed to the focused trace", async () => {
    const { scroller, virtualizer } = createFakeFeed();

    renderHook(() =>
      useScrollToFocusedSessionTrace({
        focusTarget: FOCUS_TARGET,
        traceIds: TRACE_IDS,
        virtualizer,
      }),
    );
    await runFrames();

    expect(scroller.scrollTop).toBe(TARGET_OFFSET);
  });

  it("still scrolls when the feed remounts before the scroll lands", async () => {
    const { scroller, virtualizer } = createFakeFeed();

    renderHook(
      () =>
        useScrollToFocusedSessionTrace({
          focusTarget: FOCUS_TARGET,
          traceIds: TRACE_IDS,
          virtualizer,
        }),
      { wrapper: StrictMode },
    );
    await runFrames();

    expect(scroller.scrollTop).toBe(TARGET_OFFSET);
  });

  it("stops pinning once the focus target is gone", async () => {
    const { scroller, virtualizer } = createFakeFeed();

    const { rerender } = renderHook(
      ({ focusTarget }: { focusTarget: SessionFocusTarget | null }) =>
        useScrollToFocusedSessionTrace({
          focusTarget,
          traceIds: TRACE_IDS,
          virtualizer,
        }),
      {
        initialProps: {
          focusTarget: FOCUS_TARGET as SessionFocusTarget | null,
        },
      },
    );
    await runFrames();

    // The feed outlives the focus params: a sibling session replaces its traces
    // without remounting it. A pin left running would drag the new list back to
    // the row index it started on.
    rerender({ focusTarget: null });
    scroller.scrollTop = 0;
    await runFrames();

    expect(scroller.scrollTop).toBe(0);
  });
});
