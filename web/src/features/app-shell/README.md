# App shell

Navigation is one persistent surface with three modes: collapsed, expanded, and mobile. Desktop expansion animates the surface and its layout gutter together. Icon lanes, row heights, organization controls, and the footer stay anchored; labels reveal inside that structure. Native CSS transitions reverse from their current position without animation timers or intermediate React state and respect reduced motion.

Collapsed icons keep the standard navigation label tooltips and hover styling. The existing organization selector stays at the top, the existing project/organization breadcrumb selectors stay in page chrome, and the page header owns desktop expansion. Cmd/Ctrl+B toggles expansion. Browser preferences are preserved.

Below `md`, the hamburger opens the same mounted surface as a full-width modal menu with touch-sized rows. Its close button, navigation, and breakpoint changes release transient menus and focus/scroll locks. Returning to desktop preserves the expansion preference.

The shell is selected per browser through the user menu or `?shell=next` / `?shell=classic`. Project discovery, organization overview, and root landing policies are independent of this sidebar.

## Owner map

| Concern | Owner |
| --- | --- |
| Expansion, viewport and child-menu state | `stores/sidebarStore.ts`, provided by `contexts/AppShellSidebarProvider.tsx` |
| Persistent surface, gutter and mobile modality | `components/ShellSidebar.tsx` |
| Width, label and presence transitions | `components/sidebarMotion.module.css`, `components/nav/SidebarNavItem.module.css` |
| Panel composition and organization header | `components/AppShellSidebarPanel.tsx`, `components/SidebarOrganizationHeader.tsx` |
| Desktop expansion and mobile opener reference | `components/AppShell.tsx`, `components/SidebarExpansionToggle.tsx` |
| Standard hover/focus tooltips | `components/nav/SidebarNavItem.tsx` (context-free, explicit `isCollapsed`) |
| Filtered links and group separators | `components/SidebarNavigation.tsx`, `components/layouts/routes.tsx` |
| Keyboard and route lifecycle | `hooks/useSidebarShortcuts.ts`, `contexts/AppShellSidebarProvider.tsx` |

## Contracts

- `menuNode({ isCollapsed })` gives custom menu controls the same rail layout without duplicating their state, dialogs or switch IDs.
- Tooltips contain only the navigation label. The original link or button owns focus and actions.
- Page chrome owns the single desktop expansion control and mobile hamburger; the mobile panel owns its close control.
- All three modes retain the same panel and control DOM nodes. Mode changes alter layout and modality rather than mounting separate render trees.
- The passive gutter owns `data-sidebar="sidebar"`: desktop peeks reserve its animated width, while mobile measures zero.
- The store owns viewport transitions and the single active child menu. A breakpoint change, parent close, or route transition closes transient UI and keeps the desktop preference.
- Collapsing desktop navigation closes the organization menu before its trigger becomes inert. Mobile focus returns to the actual hamburger ref supplied by page chrome.
- Child overlays portal into containers inside the persistent surface so the mobile focus scope includes them. Escape closes the innermost surface first.
- Account actions that open root-layer dialogs release transient navigation and its modality before handing focus to the dialog.
- Account and organization identity boundaries remain blocked from replay, including portaled content.
