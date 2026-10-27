import {
  createSidebarStore,
  SIDEBAR_CLOSE_DELAY_MS,
  SIDEBAR_OPEN_DELAY_MS,
  SIDEBAR_PINNED_STORAGE_KEY,
} from "@/src/features/app-shell/stores/sidebarStore";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

function setup(initial: Record<string, string> = {}) {
  const storage = memoryStorage(initial);
  const store = createSidebarStore({ storage });
  return { storage, store, actions: store.getState().actions };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("pinned preference", () => {
  it("starts pinned without a stored preference", () => {
    expect(setup().store.getState().isPinned).toBe(true);
  });

  it("carries over a collapsed legacy sidebar as unpinned", () => {
    const { store } = setup({ "sidebar:state": "false" });
    expect(store.getState().isPinned).toBe(false);
  });

  it("prefers its own key over the legacy one and persists changes", () => {
    const { store, storage, actions } = setup({
      "sidebar:state": "false",
      [SIDEBAR_PINNED_STORAGE_KEY]: "true",
    });
    expect(store.getState().isPinned).toBe(true);

    actions.setPinned(false);
    expect(storage.getItem(SIDEBAR_PINNED_STORAGE_KEY)).toBe("false");
    expect(createSidebarStore({ storage }).getState().isPinned).toBe(false);
  });

  it("falls back to pinned when storage is unavailable", () => {
    expect(createSidebarStore({ storage: null }).getState().isPinned).toBe(
      true,
    );
  });
});

describe("hover overlay", () => {
  const unpinned = () =>
    setup({ [SIDEBAR_PINNED_STORAGE_KEY]: JSON.stringify(false) });

  it("opens after the pointer rests on the trigger", () => {
    const { store, actions } = unpinned();

    actions.pointerEnterTrigger();
    vi.advanceTimersByTime(SIDEBAR_OPEN_DELAY_MS - 1);
    expect(store.getState().peek).toBe("closed");

    vi.advanceTimersByTime(1);
    expect(store.getState().peek).toBe("hover");
  });

  it("ignores a pointer sweeping past the trigger", () => {
    const { store, actions } = unpinned();

    actions.pointerEnterTrigger();
    vi.advanceTimersByTime(SIDEBAR_OPEN_DELAY_MS / 2);
    actions.pointerLeaveTrigger();
    vi.runAllTimers();

    expect(store.getState().peek).toBe("closed");
  });

  it("closes after the pointer leaves, unless it comes back in time", () => {
    const { store, actions } = unpinned();
    actions.openOverlay("hover");
    actions.pointerEnterPanel();

    actions.pointerLeavePanel();
    vi.advanceTimersByTime(SIDEBAR_CLOSE_DELAY_MS - 1);
    actions.pointerEnterPanel();
    vi.runAllTimers();
    expect(store.getState().peek).toBe("hover");

    actions.pointerLeavePanel();
    vi.advanceTimersByTime(SIDEBAR_CLOSE_DELAY_MS);
    expect(store.getState().peek).toBe("closed");
  });

  it("stays open while a menu it owns is held, then closes once released", () => {
    const { store, actions } = unpinned();
    actions.openOverlay("hover");
    actions.pointerEnterPanel();

    const release = actions.hold();
    actions.pointerLeavePanel();
    vi.runAllTimers();
    expect(store.getState().peek).toBe("hover");

    release();
    release();
    vi.advanceTimersByTime(SIDEBAR_CLOSE_DELAY_MS);
    expect(store.getState().peek).toBe("closed");
  });

  it("drops holds when it closes, so a late release cannot affect the next opening", () => {
    const { store, actions } = unpinned();
    actions.openOverlay("hover");
    const staleRelease = actions.hold();
    actions.close();

    actions.openOverlay("hover");
    const release = actions.hold();
    staleRelease();
    actions.pointerLeavePanel();
    vi.runAllTimers();
    expect(store.getState().peek).toBe("hover");

    release();
    vi.advanceTimersByTime(SIDEBAR_CLOSE_DELAY_MS);
    expect(store.getState().peek).toBe("closed");
  });

  it("stays open while the switcher is open", () => {
    const { store, actions } = unpinned();
    actions.openOverlay("hover");
    actions.setSwitcherOpen(true);

    actions.pointerLeavePanel();
    vi.runAllTimers();
    expect(store.getState().peek).toBe("hover");

    actions.setSwitcherOpen(false);
    vi.advanceTimersByTime(SIDEBAR_CLOSE_DELAY_MS);
    expect(store.getState().peek).toBe("closed");
  });

  it("ignores a dismissal while a menu or the switcher it owns is open", () => {
    const { store, actions } = unpinned();
    actions.openOverlay("keyboard");

    const release = actions.hold();
    actions.dismiss();
    expect(store.getState().peek).toBe("keyboard");
    release();

    actions.setSwitcherOpen(true);
    actions.dismiss();
    expect(store.getState().peek).toBe("keyboard");
    actions.setSwitcherOpen(false);

    actions.dismiss();
    expect(store.getState().peek).toBe("closed");
  });

  it("does not open while pinned", () => {
    const { store, actions } = setup();

    actions.pointerEnterTrigger();
    vi.runAllTimers();
    actions.openOverlay("keyboard");

    expect(store.getState().peek).toBe("closed");
  });
});

describe("pinning", () => {
  it("keeps an unpinned sidebar under the pointer until the pointer leaves", () => {
    const { store, actions } = setup();

    actions.setPinned(false);
    expect(store.getState()).toMatchObject({ isPinned: false, peek: "hover" });
    vi.runAllTimers();
    expect(store.getState().peek).toBe("hover");

    actions.pointerLeavePanel();
    vi.advanceTimersByTime(SIDEBAR_CLOSE_DELAY_MS);
    expect(store.getState().peek).toBe("closed");
  });

  it("docks the overlay when pinned from it", () => {
    const { store, actions } = setup({ [SIDEBAR_PINNED_STORAGE_KEY]: "false" });
    actions.openOverlay("hover");

    actions.setPinned(true);

    expect(store.getState()).toMatchObject({ isPinned: true, peek: "closed" });
  });
});

describe("keyboard", () => {
  it("toggles the overlay with the shortcut and ignores the pointer leaving", () => {
    const { store, actions } = setup({ [SIDEBAR_PINNED_STORAGE_KEY]: "false" });

    actions.toggleFromShortcut("desktop");
    expect(store.getState().peek).toBe("keyboard");
    actions.pointerEnterPanel();
    actions.pointerLeavePanel();
    vi.runAllTimers();
    expect(store.getState().peek).toBe("keyboard");

    actions.toggleFromShortcut("desktop");
    expect(store.getState().peek).toBe("closed");
  });

  it("hides a pinned sidebar with the shortcut and remembers it", () => {
    const { store, storage, actions } = setup();

    actions.toggleFromShortcut("desktop");

    expect(store.getState()).toMatchObject({ isPinned: false, peek: "closed" });
    expect(storage.getItem(SIDEBAR_PINNED_STORAGE_KEY)).toBe("false");
  });

  it("toggles the mobile sheet instead of the overlay on small screens", () => {
    const { store, actions } = setup();

    actions.toggleFromShortcut("mobile");
    expect(store.getState()).toMatchObject({
      isMobileOpen: true,
      peek: "closed",
    });

    actions.toggleFromShortcut("mobile");
    expect(store.getState().isMobileOpen).toBe(false);
  });
});

describe("workspace switcher", () => {
  it("reveals a hidden sidebar for the switcher and hides it again afterwards", () => {
    const { store, actions } = setup({ [SIDEBAR_PINNED_STORAGE_KEY]: "false" });

    actions.openSwitcher("desktop");
    expect(store.getState()).toMatchObject({
      peek: "keyboard",
      isSwitcherOpen: true,
    });

    actions.setSwitcherOpen(false);
    expect(store.getState()).toMatchObject({
      peek: "closed",
      isSwitcherOpen: false,
    });
  });

  it("leaves a sidebar the user opened alone when the switcher closes", () => {
    const { store, actions } = setup({ [SIDEBAR_PINNED_STORAGE_KEY]: "false" });
    actions.toggleFromShortcut("desktop");

    actions.openSwitcher("desktop");
    actions.setSwitcherOpen(false);

    expect(store.getState().peek).toBe("keyboard");
  });

  it("only opens the switcher when the sidebar is pinned", () => {
    const { store, actions } = setup();

    actions.openSwitcher("desktop");

    expect(store.getState()).toMatchObject({
      isPinned: true,
      peek: "closed",
      isSwitcherOpen: true,
    });
  });

  it("opens the mobile sheet with the switcher, and closing the sheet closes both", () => {
    const { store, actions } = setup();

    actions.openSwitcher("mobile");
    expect(store.getState()).toMatchObject({
      isMobileOpen: true,
      isSwitcherOpen: true,
    });

    actions.setMobileOpen(false);
    expect(store.getState()).toMatchObject({
      isMobileOpen: false,
      isSwitcherOpen: false,
    });
  });

  it("closes with the overlay on navigation", () => {
    const { store, actions } = setup({ [SIDEBAR_PINNED_STORAGE_KEY]: "false" });
    actions.openSwitcher("desktop");

    actions.close();

    expect(store.getState()).toMatchObject({
      peek: "closed",
      isSwitcherOpen: false,
    });
  });
});
