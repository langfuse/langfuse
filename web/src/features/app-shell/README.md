# App shell

Navigation is one persistent surface with three modes: collapsed, expanded, and mobile. Desktop expansion animates the surface and its layout gutter together. Icon lanes, row heights, organization controls, and the footer stay anchored; labels reveal inside that structure. Native CSS transitions reverse from their current position without animation timers or intermediate React state and respect reduced motion.

Collapsed icons keep the standard navigation label tooltips and hover styling. The existing organization selector stays at the top, the existing project/organization breadcrumb selectors stay in page chrome, and the page header owns desktop expansion. Hovering the sidebar's right border shows a thin line and a resize cursor (west when expanded, east when collapsed); clicking that border toggles expansion as a secondary affordance. Cmd/Ctrl+B toggles expansion. Browser preferences are preserved.

Below `md`, the hamburger opens the same mounted surface as a full-width modal menu with touch-sized rows. Its close button, navigation, and breakpoint changes release transient menus and focus/scroll locks. Returning to desktop preserves the expansion preference.

Authenticated pages use this shell. Project discovery, organization overview, and root landing policies are independent of this sidebar.

## Owner map

| Concern | Owner |
| --- | --- |
| Expansion, viewport and child-menu state | `stores/sidebarStore.ts`, provided by `contexts/AppShellSidebarProvider.tsx` |
| Persistent surface, gutter and mobile modality | `components/ShellSidebar.tsx` |
| Width, label and presence transitions | `components/sidebarMotion.module.css`, `components/nav/SidebarNavItem.module.css` |
| Panel composition and organization header | `components/AppShellSidebarPanel.tsx`, `components/SidebarOrganizationHeader.tsx` |
| Desktop expansion and mobile opener reference | `components/AppShell.tsx`, `components/SidebarExpansionToggle.tsx`, `components/SidebarBorderToggle.tsx` |
| Standard hover/focus tooltips | `components/nav/SidebarNavItem.tsx` (context-free, explicit `isCollapsed`) |
| Filtered links and group separators | `components/SidebarNavigation.tsx`, `components/layouts/routes.tsx` |
| Keyboard and route lifecycle | `hooks/useSidebarShortcuts.ts`, `contexts/AppShellSidebarProvider.tsx` |

## Contracts

- `menuNode({ isCollapsed })` gives custom menu controls the same rail layout without duplicating their state, dialogs or switch IDs.
- Collapsed tooltips use the navigation label by default. Controls can provide an explanatory description, visible on hover or focus in every mode. The original link or button owns focus and actions.
- Desktop uses the classic sidebar's 204px expanded width and 32px navigation rows. The 48px collapsed rail retains the same icon positions; mobile stays full width with 44px touch targets. Row consumers can override `--sidebar-nav-row-height` and `--sidebar-nav-leading-width`.
- Page chrome owns the primary desktop expansion control and mobile hamburger. The sidebar's right border is a secondary desktop toggle (hover line, west/east resize cursor, not in the tab order) and is absent in mobile mode. The mobile panel owns its close control.
- All three modes retain the same panel and control DOM nodes. Mode changes alter layout and modality rather than mounting separate render trees.
- The passive gutter owns `data-sidebar="sidebar"`: desktop peeks reserve its animated width, while mobile measures zero.
- The store owns viewport transitions and the single active child menu. A breakpoint change, parent close, or route transition closes transient UI and keeps the desktop preference.
- Collapsing desktop navigation closes the organization menu before its trigger becomes inert. Mobile focus returns to the actual hamburger ref supplied by page chrome.
- Child popovers portal inside the persistent surface. Child dialogs use a stable host in the modal layer, outside the sidebar's inert subtree and included in its mobile focus scope. Escape closes the innermost surface first.
- Activating a same-tab sidebar link closes transient navigation even when its pathname stays the same. Background query-only route changes keep navigation open.
- Account actions that open root-layer dialogs release transient navigation and its modality before handing focus to the dialog.
- Account and organization identity boundaries remain blocked from replay, including portaled content.
