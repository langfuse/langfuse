import {
  createSidebarStore,
  SIDEBAR_EXPANDED_STORAGE_KEY,
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

describe("desktop expansion preference", () => {
  it("starts as an icon rail without a stored preference or available storage", () => {
    expect(setup().store.getState().isExpanded).toBe(false);
    expect(createSidebarStore({ storage: null }).getState().isExpanded).toBe(
      false,
    );
  });

  it("carries over collapsed classic and unpinned preview preferences as a rail", () => {
    expect(
      setup({ "sidebar:state": "false" }).store.getState().isExpanded,
    ).toBe(false);
    expect(
      setup({ "langfuse:sidebar:pinned:v1": "false" }).store.getState()
        .isExpanded,
    ).toBe(false);
  });

  it("prefers the shell preference and persists explicit expansion", () => {
    const { store, storage, actions } = setup({
      "sidebar:state": "false",
      [SIDEBAR_EXPANDED_STORAGE_KEY]: "true",
    });
    expect(store.getState().isExpanded).toBe(true);

    actions.setExpanded(false);
    expect(storage.getItem(SIDEBAR_EXPANDED_STORAGE_KEY)).toBe("false");
    expect(createSidebarStore({ storage }).getState().isExpanded).toBe(false);

    actions.setExpanded(true);
    expect(createSidebarStore({ storage }).getState().isExpanded).toBe(true);
  });

  it("toggles desktop expansion with the shortcut and remembers it", () => {
    const { store, storage, actions } = setup();

    actions.toggleFromShortcut("desktop");
    expect(store.getState().isExpanded).toBe(true);
    expect(storage.getItem(SIDEBAR_EXPANDED_STORAGE_KEY)).toBe("true");

    actions.toggleFromShortcut("desktop");
    expect(store.getState().isExpanded).toBe(false);
    expect(storage.getItem(SIDEBAR_EXPANDED_STORAGE_KEY)).toBe("false");
  });
});

describe("transient navigation", () => {
  it("opens the desktop switcher from the rail without expanding it", () => {
    const { store, actions } = setup({
      [SIDEBAR_EXPANDED_STORAGE_KEY]: "false",
    });

    actions.openSwitcher("desktop");
    expect(store.getState()).toMatchObject({
      isExpanded: false,
      isSwitcherOpen: true,
      isMobileOpen: false,
    });

    actions.setSwitcherOpen(false);
    expect(store.getState().isExpanded).toBe(false);
  });

  it("opens the mobile menu with the switcher and closes both together", () => {
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

  it("toggles the mobile menu without changing desktop expansion", () => {
    const { store, storage, actions } = setup();

    actions.toggleFromShortcut("mobile");
    expect(store.getState()).toMatchObject({
      isMobileOpen: true,
      isExpanded: false,
    });
    actions.setSwitcherOpen(true);
    actions.toggleFromShortcut("mobile");
    expect(store.getState()).toMatchObject({
      isMobileOpen: false,
      isSwitcherOpen: false,
      isExpanded: false,
    });
    expect(storage.getItem(SIDEBAR_EXPANDED_STORAGE_KEY)).toBeNull();
  });

  it("closes transient navigation while retaining the desktop preference", () => {
    const { store, storage, actions } = setup({
      [SIDEBAR_EXPANDED_STORAGE_KEY]: "false",
    });
    actions.openSwitcher("mobile");

    actions.close();

    expect(store.getState()).toMatchObject({
      isExpanded: false,
      isMobileOpen: false,
      isSwitcherOpen: false,
    });
    expect(storage.getItem(SIDEBAR_EXPANDED_STORAGE_KEY)).toBe("false");
  });
});
