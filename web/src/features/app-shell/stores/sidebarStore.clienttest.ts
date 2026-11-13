import { createSidebarMenuControls } from "@/src/features/app-shell/fns/createSidebarMenuControls";
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
  const store = createSidebarStore({ storage, isMobile: false });
  return { storage, store, actions: store.getState().actions };
}

describe("desktop expansion preference", () => {
  it("starts as an icon rail without a stored preference or available storage", () => {
    expect(setup().store.getState().isExpanded).toBe(false);
    expect(
      createSidebarStore({ storage: null, isMobile: false }).getState()
        .isExpanded,
    ).toBe(false);
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
      activeMenu: "workspace",
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
      activeMenu: "workspace",
    });

    actions.setMobileOpen(false);
    expect(store.getState()).toMatchObject({
      isMobileOpen: false,
      activeMenu: null,
    });
  });

  it("toggles the mobile menu without changing desktop expansion", () => {
    const { store, storage, actions } = setup();

    actions.setActiveMenu("account");
    actions.toggleFromShortcut("mobile");
    expect(store.getState()).toMatchObject({
      isMobileOpen: true,
      isExpanded: false,
      activeMenu: null,
    });
    actions.setSwitcherOpen(true);
    actions.toggleFromShortcut("mobile");
    expect(store.getState()).toMatchObject({
      isMobileOpen: false,
      activeMenu: null,
      isExpanded: false,
    });
    expect(storage.getItem(SIDEBAR_EXPANDED_STORAGE_KEY)).toBeNull();
  });

  it("releases account and version menus when their mobile parent closes", () => {
    const { store, storage, actions } = setup({
      [SIDEBAR_EXPANDED_STORAGE_KEY]: "true",
    });

    for (const menu of ["account", "version"] as const) {
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
    actions.setActiveMenu("version");
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

    for (const menu of ["account", "version"] as const) {
      const controls = createSidebarMenuControls(store, menu);
      controls.onOpenChange(true);
      actions.openSwitcher("desktop");

      controls.onOpenChange(false);
      const handoff = new Event("closeAutoFocus", { cancelable: true });
      controls.onCloseAutoFocus(handoff);
      expect(store.getState().activeMenu).toBe("workspace");
      expect(handoff.defaultPrevented).toBe(true);

      actions.setSwitcherOpen(false);
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
    actions.openSwitcher("mobile");

    actions.close();

    expect(store.getState()).toMatchObject({
      isExpanded: false,
      isMobileOpen: false,
      activeMenu: null,
    });
    expect(storage.getItem(SIDEBAR_EXPANDED_STORAGE_KEY)).toBe("false");
  });
});
