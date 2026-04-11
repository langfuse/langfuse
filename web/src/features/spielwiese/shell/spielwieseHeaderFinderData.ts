import { type LucideIcon } from "lucide-react";
import type { SpielwieseDashboardVM } from "../types/dashboard";
import type {
  SpielwieseFooterTool,
  SpielwieseNavGroup,
  SpielwieseSidebarSection,
  SpielwieseSidebarTreeItem,
} from "../types/shell";

export type FinderItem = {
  description: string;
  emoji?: string;
  href: string;
  icon?: LucideIcon;
  id: string;
  isCurrent: boolean;
  keywords: string;
  label: string;
  order: number;
};

export function normalizeFinderText(value: string) {
  return value.trim().toLowerCase();
}

function formatFinderGroupLabel(id: string) {
  return id
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function createFinderItem({
  description,
  emoji,
  href,
  icon,
  id,
  isCurrent = false,
  keywords = "",
  label,
  order,
}: Omit<FinderItem, "isCurrent" | "keywords" | "order"> & {
  isCurrent?: boolean;
  keywords?: string;
  order: number;
}) {
  return {
    description,
    emoji,
    href,
    icon,
    id,
    isCurrent,
    keywords: normalizeFinderText(`${label} ${description} ${keywords}`),
    label,
    order,
  };
}

function mergeFinderItems(existing: FinderItem, next: FinderItem) {
  const preferredItem =
    next.label.length > existing.label.length ? next : existing;

  return {
    ...preferredItem,
    isCurrent: existing.isCurrent || next.isCurrent,
    keywords: normalizeFinderText(
      [
        existing.keywords,
        next.keywords,
        existing.label,
        next.label,
        existing.description,
        next.description,
      ].join(" "),
    ),
    order: Math.min(existing.order, next.order),
  };
}

function upsertFinderItem(items: Map<string, FinderItem>, item: FinderItem) {
  const existingItem = items.get(item.href);

  items.set(
    item.href,
    existingItem ? mergeFinderItems(existingItem, item) : item,
  );
}

function getSidebarFinderItems({
  currentPageId,
  items,
  order,
  path,
  sectionLabel,
}: {
  currentPageId: string;
  items: SpielwieseSidebarTreeItem[];
  order: number;
  path: string[];
  sectionLabel: string;
}) {
  return items.reduce<{ items: FinderItem[]; order: number }>(
    (accumulator, item) => {
      const nextPath = [...path, item.label];
      const currentItem = createFinderItem({
        description: [sectionLabel, ...path].join(" / "),
        emoji: item.emoji,
        href: item.href,
        icon: item.icon,
        id: item.id,
        isCurrent: item.href.replace(/^#/, "") === currentPageId,
        keywords: nextPath.join(" "),
        label: item.label,
        order: accumulator.order,
      });
      const childItems = item.children
        ? getSidebarFinderItems({
            currentPageId,
            items: item.children,
            order: accumulator.order + 1,
            path: nextPath,
            sectionLabel,
          })
        : { items: [], order: accumulator.order + 1 };

      return {
        items: [...accumulator.items, currentItem, ...childItems.items],
        order: childItems.order,
      };
    },
    { items: [], order },
  );
}

function addUtilityFinderItems({
  breadcrumb,
  currentPageId,
  items,
  utilityNavGroups,
}: {
  breadcrumb: string;
  currentPageId: string;
  items: Map<string, FinderItem>;
  utilityNavGroups: SpielwieseNavGroup[];
}) {
  let order = items.size;

  utilityNavGroups.forEach((group) => {
    group.items.forEach((item) => {
      upsertFinderItem(
        items,
        createFinderItem({
          description: formatFinderGroupLabel(group.id),
          href: item.href,
          icon: item.icon,
          id: item.id,
          isCurrent: item.href.replace(/^#/, "") === currentPageId,
          keywords: breadcrumb,
          label: item.label,
          order: order++,
        }),
      );
    });
  });

  return order;
}

function addSidebarFinderItems({
  currentPageId,
  items,
  order,
  sidebarSections,
}: {
  currentPageId: string;
  items: Map<string, FinderItem>;
  order: number;
  sidebarSections: SpielwieseSidebarSection[];
}) {
  let nextOrder = order;

  sidebarSections.forEach((section) => {
    const sidebarItems = getSidebarFinderItems({
      currentPageId,
      items: section.items,
      order: nextOrder,
      path: [],
      sectionLabel: section.label,
    });

    sidebarItems.items.forEach((item) => upsertFinderItem(items, item));
    nextOrder = sidebarItems.order;
  });

  return nextOrder;
}

function addFooterFinderItems({
  breadcrumb,
  footerTools,
  items,
  order,
}: {
  breadcrumb: string;
  footerTools: SpielwieseFooterTool[];
  items: Map<string, FinderItem>;
  order: number;
}) {
  footerTools.forEach((tool, index) => {
    upsertFinderItem(
      items,
      createFinderItem({
        description: "Tool",
        href: tool.href,
        icon: tool.icon,
        id: tool.id,
        keywords: breadcrumb,
        label: tool.label,
        order: order + index,
      }),
    );
  });
}

export function buildFinderItems({
  breadcrumb,
  currentPageId,
  footerTools,
  sidebarSections,
  utilityNavGroups,
}: {
  breadcrumb: SpielwieseDashboardVM["header"]["breadcrumb"];
  currentPageId: SpielwieseDashboardVM["pageId"];
  footerTools: SpielwieseFooterTool[];
  sidebarSections: SpielwieseSidebarSection[];
  utilityNavGroups: SpielwieseNavGroup[];
}) {
  const items = new Map<string, FinderItem>();
  const utilityOrder = addUtilityFinderItems({
    breadcrumb,
    currentPageId,
    items,
    utilityNavGroups,
  });
  const sidebarOrder = addSidebarFinderItems({
    currentPageId,
    items,
    order: utilityOrder,
    sidebarSections,
  });

  addFooterFinderItems({
    breadcrumb,
    footerTools,
    items,
    order: sidebarOrder,
  });

  return [...items.values()];
}

function getFinderItemScore(item: FinderItem, query: string) {
  if (!query) {
    return item.isCurrent ? 1_000 - item.order : -item.order;
  }

  const label = normalizeFinderText(item.label);
  const description = normalizeFinderText(item.description);

  if (label === query) {
    return 500;
  }

  if (label.startsWith(query)) {
    return 400;
  }

  if (label.includes(query)) {
    return 250;
  }

  if (item.keywords.includes(query)) {
    return 120;
  }

  if (description.includes(query)) {
    return 60;
  }

  return -1;
}

export function getFilteredFinderItems(items: FinderItem[], query: string) {
  return items
    .map((item) => ({
      item,
      score: getFinderItemScore(item, query),
    }))
    .filter((entry) => entry.score >= 0)
    .sort(
      (left, right) =>
        right.score - left.score || left.item.order - right.item.order,
    )
    .map((entry) => entry.item)
    .slice(0, 7);
}
