import type { PageCapture } from "@/src/features/in-app-agent/stage/capture/capturePage";
import { createPageCaptureCache } from "@/src/features/in-app-agent/stage/capture/pageCaptureCache";

const capturePage = vi.hoisted(() => vi.fn());

vi.mock("@/src/features/in-app-agent/stage/capture/capturePage", () => ({
  CAPTURE_FIT_ATTRIBUTE: "data-assistant-capture-fit",
  capturePage,
}));

function fakeCapture(id: number) {
  return { id } as unknown as PageCapture;
}

/** MutationObserver callbacks run as microtasks after the mutation. */
const flushMutations = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createPageCaptureCache", () => {
  let captures = 0;
  let cache: ReturnType<typeof createPageCaptureCache>;
  let page: HTMLDivElement;

  beforeEach(() => {
    captures = 0;
    capturePage.mockImplementation(async () => fakeCapture(++captures));
    document.body.innerHTML = `
      <div id="__next">
        <div id="page">content</div>
        <button data-assistant-stage-launcher>Assistant</button>
      </div>
      <div data-overlay-root>
        <div data-layer="tooltip"></div>
        <div data-layer="agent"></div>
        <div data-layer="stage"></div>
      </div>`;
    page = document.getElementById("page") as HTMLDivElement;
    cache = createPageCaptureCache({ resolveScale: () => 2 });
  });

  afterEach(() => {
    cache.dispose();
    capturePage.mockReset();
  });

  it("reuses a warm capture while the page is unchanged", async () => {
    const first = await cache.acquire();
    await flushMutations();

    expect(await cache.acquire()).toBe(first);
    expect(capturePage).toHaveBeenCalledTimes(1);
  });

  it("shares one in-flight capture between prewarm and acquire", async () => {
    cache.prewarm();
    const capture = await cache.acquire();

    expect(capture).toEqual(fakeCapture(1));
    expect(capturePage).toHaveBeenCalledTimes(1);
  });

  it("captures again after the page changes", async () => {
    await cache.acquire();
    page.textContent = "changed";
    await flushMutations();

    expect(await cache.acquire()).toEqual(fakeCapture(2));
  });

  it("captures again after the page scrolls", async () => {
    await cache.acquire();
    page.dispatchEvent(new Event("scroll"));

    expect(await cache.acquire()).toEqual(fakeCapture(2));
  });

  it("does not let a capture that raced a change become the warm one", async () => {
    let finish!: (capture: PageCapture) => void;
    capturePage.mockImplementationOnce(
      () =>
        new Promise<PageCapture>((resolve) => {
          finish = resolve;
        }),
    );
    const racing = cache.acquire();
    page.textContent = "changed mid-capture";
    await flushMutations();
    finish(fakeCapture(99));
    await racing;

    expect(await cache.acquire()).toEqual(fakeCapture(1));
  });

  it("ignores text the capture rewrites and restores while it measures", async () => {
    const text = page.firstChild as Text;
    capturePage.mockImplementationOnce(async () => {
      text.data = "cont…";
      await flushMutations();
      text.data = "content";
      return fakeCapture(++captures);
    });
    const first = await cache.acquire();
    await flushMutations();

    expect(await cache.acquire()).toBe(first);
  });

  it("still notices text that really changed while a capture ran", async () => {
    const text = page.firstChild as Text;
    capturePage.mockImplementationOnce(async () => {
      text.data = "new content";
      await flushMutations();
      return fakeCapture(++captures);
    });
    await cache.acquire();
    await flushMutations();

    expect(await cache.acquire()).toEqual(fakeCapture(2));
  });

  it.each([
    [
      "the launcher reacting to the open",
      () => {
        document
          .querySelector("[data-assistant-stage-launcher]")
          ?.classList.add("animate-pulse");
      },
    ],
    [
      "nodes that already left the document",
      () => {
        const canvas = document.createElement("canvas");
        document.querySelector("[data-layer='agent']")?.append(canvas);
        canvas.width = 0;
        canvas.remove();
      },
    ],
    [
      "transient overlays",
      () => {
        document
          .querySelector("[data-layer='tooltip']")
          ?.append(document.createElement("span"));
      },
    ],
    [
      "the stage's own layer",
      () => {
        document
          .querySelector("[data-layer='stage']")
          ?.append(document.createElement("div"));
      },
    ],
    [
      "nodes the capture engine inserts for measuring",
      () => {
        const slot = document.createElement("div");
        slot.setAttribute("data-snapdom-internal", "");
        document.body.append(slot);
        slot.remove();
      },
    ],
    [
      "temporary capture attributes and inert toggles",
      () => {
        page.setAttribute("data-assistant-capture-fit", "");
        document.getElementById("__next")?.setAttribute("inert", "");
      },
    ],
  ])("ignores changes to %s", async (_name, mutate) => {
    const first = await cache.acquire();
    mutate();
    await flushMutations();

    expect(await cache.acquire()).toBe(first);
  });

  it("does not make an open wait on a background capture", async () => {
    vi.useFakeTimers();
    try {
      capturePage.mockImplementationOnce(() => new Promise(() => undefined));
      cache.enableIdlePrewarm();
      await vi.advanceTimersByTimeAsync(5_000);
      expect(capturePage).toHaveBeenCalledWith(2, { yieldToPage: true });

      const capture = await cache.acquire();

      expect(capturePage).toHaveBeenLastCalledWith(2, { yieldToPage: false });
      expect(capture).toEqual(fakeCapture(1));
    } finally {
      vi.useRealTimers();
    }
  });

  it("recaptures in idle time once enabled, after the page goes quiet", async () => {
    vi.useFakeTimers();
    try {
      cache.enableIdlePrewarm();
      vi.advanceTimersByTime(1_499);
      expect(capturePage).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(3_000);
      expect(capturePage).toHaveBeenCalledWith(2, { yieldToPage: true });
    } finally {
      vi.useRealTimers();
    }
  });
});
