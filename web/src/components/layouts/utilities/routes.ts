import { RouteSection, RouteGroup, ROUTES, type Route } from "../routes";

export type NavigationItem = Omit<Route, "children" | "items"> & {
  url: string;
  isActive: boolean;
  items?: NavigationItem[];
};

// Helper to group processed navigation items
const groupProcessedNavigation = (items: NavigationItem[]) => {
  const ungrouped = items.filter((item) => !item.group);
  const grouped: Partial<Record<RouteGroup, NavigationItem[]>> = {};

  // Only create groups that have actual items
  items.forEach((item) => {
    if (item.group) {
      if (!grouped[item.group]) {
        grouped[item.group] = [];
      }
      grouped[item.group]!.push(item);
    }
  });

  // Return null for grouped if no groups were created
  const groupedResult = Object.keys(grouped).length > 0 ? grouped : null;

  // Build flattened array preserving group order
  const groupedItems = groupedResult
    ? [
        ...(grouped[RouteGroup.Observability] || []),
        ...(grouped[RouteGroup.PromptManagement] || []),
        ...(grouped[RouteGroup.Evaluation] || []),
      ]
    : [];

  return {
    ungrouped,
    grouped: groupedResult,
    flattened: [...ungrouped, ...groupedItems],
  };
};

export function processNavigation(
  mapNavigation: (route: Route) => NavigationItem | null,
) {
  // First process all routes (apply filtering, permissions, etc.)
  const allProcessedItems = ROUTES.map(mapNavigation).filter(
    (item): item is NavigationItem => Boolean(item),
  );

  // Then group the processed items by section
  const mainItems = allProcessedItems.filter(
    (item) => item.section === RouteSection.Main,
  );
  const secondaryItems = allProcessedItems.filter(
    (item) => item.section === RouteSection.Secondary,
  );

  const mainNavigation = groupProcessedNavigation(mainItems);
  const secondaryNavigation = groupProcessedNavigation(secondaryItems);

  return {
    mainNavigation,
    secondaryNavigation,
    navigation: [...mainNavigation.flattened, ...secondaryNavigation.flattened],
  };
}
