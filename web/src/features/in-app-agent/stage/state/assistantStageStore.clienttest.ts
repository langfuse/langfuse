import type { PageContextSnapshot } from "@/src/features/page-context";
import type { PageCapture } from "@/src/features/in-app-agent/stage/capture/capturePage";
import { createAssistantStageStore } from "@/src/features/in-app-agent/stage/state/assistantStageStore";

const pageContext: PageContextSnapshot = {
  version: 1,
  kind: "trace",
  label: "Trace",
  id: "trace-1",
  title: "support-copilot",
  facts: [],
  surface: "page",
  path: "/project/p/traces/trace-1",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup() {
  const capture = deferred<PageCapture>();
  let readCount = 0;
  const store = createAssistantStageStore({
    readPageContext: () => {
      readCount += 1;
      return { ...pageContext, title: `read ${readCount}` };
    },
    acquireCapture: () => capture.promise,
    prewarmCapture: vi.fn(),
    createThumbnail: () => document.createElement("canvas"),
    readViewportAspectRatio: () => 1.6,
    createId: () => `session-${readCount}`,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
  });
  const fakeCapture = {
    scale: 2,
    cssWidth: 1440,
    cssHeight: 900,
  } as unknown as PageCapture;
  return { store, capture, fakeCapture };
}

describe("assistant stage store", () => {
  it("freezes the page context at the moment of intent, before the capture finishes", async () => {
    const { store, capture, fakeCapture } = setup();

    const opening = store.getState().actions.open("top_nav");

    expect(store.getState().phase).toBe("preparing");
    expect(store.getState().session?.context).toMatchObject({
      title: "read 1",
      capturedAt: "2026-01-01T00:00:00.000Z",
    });

    capture.resolve(fakeCapture);
    await opening;

    expect(store.getState().phase).toBe("opening");
    expect(store.getState().session).toMatchObject({
      capture: fakeCapture,
      aspectRatio: 1.6,
    });
    expect(store.getState().session?.thumbnail).toBeInstanceOf(
      HTMLCanvasElement,
    );
  });

  it("still opens without the flight when the capture fails", async () => {
    const { store, capture } = setup();

    const opening = store.getState().actions.open("keyboard_shortcut");
    capture.reject(new Error("tainted canvas"));
    await opening;

    expect(store.getState().phase).toBe("opening");
    expect(store.getState().session).toMatchObject({
      capture: null,
      thumbnail: null,
    });
  });

  it("drops a capture that lands after the user already closed", async () => {
    const { store, capture, fakeCapture } = setup();

    const opening = store.getState().actions.open("top_nav");
    store.getState().actions.close();
    capture.resolve(fakeCapture);
    await opening;

    expect(store.getState()).toMatchObject({ phase: "closed", session: null });
  });

  it("reverses a closing flight instead of capturing again", async () => {
    const { store, capture, fakeCapture } = setup();
    const opening = store.getState().actions.open("top_nav");
    capture.resolve(fakeCapture);
    await opening;
    store.getState().actions.markOpened();
    const session = store.getState().session;

    store.getState().actions.close();
    expect(store.getState().phase).toBe("closing");
    store.getState().actions.toggle("keyboard_shortcut");

    expect(store.getState().phase).toBe("opening");
    expect(store.getState().session).toBe(session);
  });

  it("restores focus to where the user was once the page is back", async () => {
    const { store, capture, fakeCapture } = setup();
    const launcher = document.createElement("button");
    document.body.appendChild(launcher);
    launcher.focus();

    const opening = store.getState().actions.open("top_nav");
    capture.resolve(fakeCapture);
    await opening;
    store.getState().actions.markOpened();
    launcher.blur();
    store.getState().actions.close();
    store.getState().actions.markClosed();

    expect(store.getState().phase).toBe("closed");
    expect(document.activeElement).toBe(launcher);
    launcher.remove();
  });

  it("ignores completion signals that do not match the current phase", () => {
    const { store } = setup();

    store.getState().actions.markOpened();
    store.getState().actions.markClosed();

    expect(store.getState().phase).toBe("closed");
  });
});
