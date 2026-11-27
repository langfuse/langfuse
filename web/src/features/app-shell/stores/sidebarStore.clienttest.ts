import { createSidebarMenuControls } from "@/src/features/app-shell/fns/createSidebarMenuControls";
import { createSidebarStore } from "@/src/features/app-shell/stores/sidebarStore";

// Keep this independent of the store to catch changes that break saved preferences.
const SIDEBAR_EXPANDED_STORAGE_KEY = "langfuse:sidebar:pinned:v1";

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
  const store = createSidebarStore({ storage, isMobile: false });
  return { storage, store, actions: store.getState().actions };
}

describe("desktop expansion preference", () => {
  it("starts expanded without a stored preference or available storage", () => {
    expect(setup().store.getState().isExpanded).toBe(true);
    expect(
      createSidebarStore({ storage: null, isMobile: false }).getState()
        .isExpanded,
    ).toBe(true);
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
    expect(
      createSidebarStore({ storage, isMobile: false }).getState().isExpanded,
    ).toBe(false);

    actions.setExpanded(true);
    expect(
      createSidebarStore({ storage, isMobile: false }).getState().isExpanded,
    ).toBe(true);
  });

  it("closes only the expanded-only organization menu when collapsing desktop navigation", () => {
    const { store, actions } = setup({
      [SIDEBAR_EXPANDED_STORAGE_KEY]: "true",
    });
    actions.setActiveMenu("organization");

    actions.setExpanded(false);

    expect(store.getState()).toMatchObject({
      isExpanded: false,
      activeMenu: null,
    });
    actions.setExpanded(true);
    actions.setActiveMenu("account");
    actions.setExpanded(false);
    expect(store.getState().activeMenu).toBe("account");
  });

  it("toggles desktop expansion with the shortcut and remembers it", () => {
    const { store, storage, actions } = setup();

    actions.toggleFromShortcut("desktop");
    expect(store.getState().isExpanded).toBe(false);
    expect(storage.getItem(SIDEBAR_EXPANDED_STORAGE_KEY)).toBe("false");

    actions.toggleFromShortcut("desktop");
    expect(store.getState().isExpanded).toBe(true);
    expect(storage.getItem(SIDEBAR_EXPANDED_STORAGE_KEY)).toBe("true");
  });
});

describe("transient navigation", () => {
  it("toggles the mobile menu without changing desktop expansion", () => {
    const { store, storage, actions } = setup();

    actions.setActiveMenu("account");
    actions.toggleFromShortcut("mobile");
    expect(store.getState()).toMatchObject({
      isMobileOpen: true,
      isExpanded: true,
      activeMenu: null,
    });
    actions.setActiveMenu("organization");
    actions.toggleFromShortcut("mobile");
    expect(store.getState()).toMatchObject({
      isMobileOpen: false,
      activeMenu: null,
      isExpanded: true,
    });
    expect(storage.getItem(SIDEBAR_EXPANDED_STORAGE_KEY)).toBeNull();
  });

  it("releases child menus when their mobile parent closes", () => {
    const { store, storage, actions } = setup({
      [SIDEBAR_EXPANDED_STORAGE_KEY]: "true",
    });

    for (const menu of ["account", "organization"] as const) {
      for (const close of [actions.close, () => actions.setMobileOpen(false)]) {
        actions.setMobileOpen(true);
        actions.setActiveMenu(menu);
        expect(store.getState().activeMenu).toBe(menu);

        close();

        expect(store.getState()).toMatchObject({
          activeMenu: null,
          isMobileOpen: false,
          isExpanded: true,
        });
        expect(storage.getItem(SIDEBAR_EXPANDED_STORAGE_KEY)).toBe("true");
      }
    }
  });

  it("closes child menus atomically across viewport breakpoints and retains expansion", () => {
    const { store, storage, actions } = setup({
      [SIDEBAR_EXPANDED_STORAGE_KEY]: "true",
    });

    actions.setActiveMenu("account");
    const desktop = store.getState();
    actions.setViewport(false);
    expect(store.getState()).toBe(desktop);

    const transitions: Array<{
      isMobile: boolean;
      isMobileOpen: boolean;
      activeMenu: string | null;
    }> = [];
    const unsubscribe = store.subscribe(
      ({ isMobile, isMobileOpen, activeMenu }) => {
        transitions.push({ isMobile, isMobileOpen, activeMenu });
      },
    );

    actions.setViewport(true);
    expect(transitions).toEqual([
      { isMobile: true, isMobileOpen: false, activeMenu: null },
    ]);
    expect(store.getState().isExpanded).toBe(true);

    actions.setMobileOpen(true);
    actions.setActiveMenu("account");
    const mobile = store.getState();
    actions.setViewport(true);
    expect(store.getState()).toBe(mobile);

    transitions.length = 0;
    actions.setViewport(false);
    expect(transitions).toEqual([
      { isMobile: false, isMobileOpen: false, activeMenu: null },
    ]);
    expect(store.getState().isExpanded).toBe(true);
    expect(storage.getItem(SIDEBAR_EXPANDED_STORAGE_KEY)).toBe("true");
    unsubscribe();
  });

  it("preserves a menu handoff against late close and autofocus callbacks", () => {
    const { store, actions } = setup();

    for (const [menu, nextMenu] of [
      ["account", "organization"],
      ["organization", "account"],
    ] as const) {
      const controls = createSidebarMenuControls(store, menu);
      controls.onOpenChange(true);
      actions.setActiveMenu(nextMenu);

      controls.onOpenChange(false);
      const handoff = new Event("closeAutoFocus", { cancelable: true });
      controls.onCloseAutoFocus(handoff);
      expect(store.getState().activeMenu).toBe(nextMenu);
      expect(handoff.defaultPrevented).toBe(true);

      actions.setActiveMenu(null);
      controls.onOpenChange(true);
      controls.onOpenChange(false);
      const escape = new Event("closeAutoFocus", { cancelable: true });
      controls.onCloseAutoFocus(escape);
      expect(store.getState().activeMenu).toBeNull();
      expect(escape.defaultPrevented).toBe(false);

      actions.setViewport(true);
      actions.setMobileOpen(true);
      controls.onOpenChange(true);
      actions.setMobileOpen(false);
      const parentClose = new Event("closeAutoFocus", { cancelable: true });
      controls.onCloseAutoFocus(parentClose);
      expect(parentClose.defaultPrevented).toBe(true);
      actions.setViewport(false);
    }
  });

  it("closes transient navigation while retaining the desktop preference", () => {
    const { store, storage, actions } = setup({
      [SIDEBAR_EXPANDED_STORAGE_KEY]: "false",
    });
    actions.setMobileOpen(true);
    actions.setActiveMenu("organization");

    actions.close();

    expect(store.getState()).toMatchObject({
      isExpanded: false,
      isMobileOpen: false,
      activeMenu: null,
    });
    expect(storage.getItem(SIDEBAR_EXPANDED_STORAGE_KEY)).toBe("false");
  });
});
