"use client";

import { useDeferredValue, useMemo, useState, type KeyboardEvent } from "react";
import type { SpielwieseDashboardVM } from "../types/dashboard";
import type { SpielwieseShellVM } from "../types/shell";
import {
  buildFinderItems,
  getFilteredFinderItems,
  normalizeFinderText,
  type FinderItem,
} from "./spielwieseHeaderFinderData";

type UseSpielwieseHeaderFinderStateParams = {
  breadcrumb: SpielwieseDashboardVM["header"]["breadcrumb"];
  onClose: () => void;
  pageId: SpielwieseDashboardVM["pageId"];
  shell: SpielwieseShellVM;
};

function resetFinderState({
  onClose,
  setActiveIndex,
  setQuery,
}: {
  onClose: () => void;
  setActiveIndex: (value: number) => void;
  setQuery: (value: string) => void;
}) {
  setQuery("");
  setActiveIndex(0);
  onClose();
}

function useFinderSearchResults({
  breadcrumb,
  pageId,
  query,
  shell,
}: Omit<UseSpielwieseHeaderFinderStateParams, "onClose"> & {
  query: string;
}) {
  const deferredQuery = useDeferredValue(query);
  const finderItems = useMemo(
    () =>
      buildFinderItems({
        breadcrumb,
        currentPageId: pageId,
        footerTools: shell.footerTools,
        sidebarSections: shell.sidebarSections,
        utilityNavGroups: shell.utilityNavGroups,
      }),
    [
      breadcrumb,
      pageId,
      shell.footerTools,
      shell.sidebarSections,
      shell.utilityNavGroups,
    ],
  );

  return useMemo(
    () =>
      getFilteredFinderItems(finderItems, normalizeFinderText(deferredQuery)),
    [deferredQuery, finderItems],
  );
}

function createFinderInputKeyDownHandler({
  closeFinder,
  filteredItems,
  safeActiveIndex,
  selectItem,
  setActiveIndex,
}: {
  closeFinder: () => void;
  filteredItems: FinderItem[];
  safeActiveIndex: number;
  selectItem: (item: FinderItem) => void;
  setActiveIndex: (value: number | ((currentValue: number) => number)) => void;
}) {
  return (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeFinder();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((currentIndex) =>
        Math.min(currentIndex + 1, filteredItems.length - 1),
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((currentIndex) => Math.max(currentIndex - 1, 0));
      return;
    }

    if (event.key === "Enter" && filteredItems[safeActiveIndex]) {
      event.preventDefault();
      selectItem(filteredItems[safeActiveIndex]);
    }
  };
}

export function useSpielwieseHeaderFinderState({
  breadcrumb,
  onClose,
  pageId,
  shell,
}: UseSpielwieseHeaderFinderStateParams) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const filteredItems = useFinderSearchResults({
    breadcrumb,
    pageId,
    query,
    shell,
  });
  const safeActiveIndex =
    filteredItems.length === 0
      ? 0
      : Math.min(activeIndex, filteredItems.length - 1);
  const closeFinder = () =>
    resetFinderState({
      onClose,
      setActiveIndex,
      setQuery,
    });
  const selectItem = (item: FinderItem) => {
    window.location.hash = item.href;
    closeFinder();
  };

  return {
    activeIndex: safeActiveIndex,
    closeFinder,
    filteredItems,
    onHoverItem: setActiveIndex,
    onInputKeyDown: createFinderInputKeyDownHandler({
      closeFinder,
      filteredItems,
      safeActiveIndex,
      selectItem,
      setActiveIndex,
    }),
    onQueryChange: (value: string) => {
      setQuery(value);
      setActiveIndex(0);
    },
    onSelectItem: selectItem,
    query,
  };
}
