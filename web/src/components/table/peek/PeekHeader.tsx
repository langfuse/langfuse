import { useLayoutEffect, useRef, useState } from "react";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Button } from "@/src/components/design-system/Button/Button";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { FloatingController } from "@/src/components/design-system/FloatingController/FloatingController";
import { EntityTitle } from "@/src/components/EntityTitle";
import { EntityTitleTabs } from "@/src/components/EntityTitleTabs";
import { type LangfuseItemType } from "@/src/components/ItemBadge";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import type { ListEntry } from "@/src/features/navigate-detail-pages/DetailPageListsProvider";
import {
  ExternalLink,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  X,
} from "@langfuse/icons";
import { useElementSize } from "@/src/hooks/useElementSize";
import {
  planPeekHeaderLayout,
  type PeekHeaderPlan,
} from "./peekHeaderOverflow";

const MIN_TITLE_PX = 240;
const TILE_PX = 32;
const MORE_BUTTON_PX = 36;
const NAV_FALLBACK_PX = 68;

/** Generic peek chrome for both desktop sheets and mobile drawers. */
export function PeekHeader({
  itemType,
  title,
  titleTabs,
  itemId,
  detailNavigationKey,
  resolveDetailNavigationPath,
  actions,
  actionsMenu,
  expand,
  openInNewTab,
  onClose,
}: {
  itemType: LangfuseItemType;
  title: string;
  titleTabs?: React.ComponentProps<typeof EntityTitleTabs>;
  itemId: string;
  detailNavigationKey?: string;
  resolveDetailNavigationPath?: (entry: ListEntry) => string;
  actions?: React.ReactNode;
  actionsMenu?: React.ReactNode;
  expand?: { isExpanded: boolean; onToggle: () => void };
  openInNewTab?: () => void;
  onClose: () => void;
}) {
  const [isMenuOpen, setMenuOpen] = useState(false);
  const [headerRef, headerSize] = useElementSize<HTMLDivElement>();
  // Control widths can change without the peek itself resizing.
  const [clusterRef, clusterSize] = useElementSize<HTMLDivElement>();
  const [titleTabsRef, titleTabsSize] = useElementSize<HTMLDivElement>();
  const hasTitleTabs = Boolean(titleTabs);
  const actionsRef = useRef<HTMLDivElement>(null);
  const openInTabRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLDivElement>(null);
  // Folded controls cannot be measured, so retain their last visible widths.
  const widthsRef = useRef<{
    actions?: number;
    openInTab?: number;
    navFull?: number;
    navCompact?: number;
    otherPinned?: number;
  }>({});
  const [plan, setPlan] = useState<PeekHeaderPlan>({
    foldActions: false,
    foldOpenInTab: false,
    navCompact: false,
  });
  const hasActions = Boolean(actions);
  const hasOpenInTab = Boolean(openInNewTab);
  const hasNav = Boolean(detailNavigationKey && resolveDetailNavigationPath);

  useLayoutEffect(() => {
    const width =
      headerRef.current?.getBoundingClientRect().width ?? headerSize?.width;
    if (!width) return;
    if (hasActions && !plan.foldActions && actionsRef.current) {
      widthsRef.current.actions = actionsRef.current.offsetWidth;
    }
    if (hasOpenInTab && !plan.foldOpenInTab && openInTabRef.current) {
      widthsRef.current.openInTab = openInTabRef.current.offsetWidth;
    }
    if (pinnedRef.current) {
      const navWidth =
        hasNav && navRef.current ? navRef.current.offsetWidth : 0;
      if (hasNav) {
        widthsRef.current.navCompact = navWidth;
        widthsRef.current.navFull = navWidth;
      }
      widthsRef.current.otherPinned =
        pinnedRef.current.offsetWidth -
        navWidth +
        (closeRef.current?.offsetWidth ?? 0);
    }
    const next = planPeekHeaderLayout({
      headerWidth: width,
      minTitle: MIN_TITLE_PX,
      tileWidth: hasTitleTabs
        ? (titleTabsRef.current?.getBoundingClientRect().width ??
          titleTabsSize?.width ??
          TILE_PX * 2)
        : TILE_PX,
      navFullWidth: hasNav ? (widthsRef.current.navFull ?? NAV_FALLBACK_PX) : 0,
      navCompactWidth: hasNav
        ? (widthsRef.current.navCompact ?? NAV_FALLBACK_PX)
        : 0,
      otherPinnedWidth: widthsRef.current.otherPinned ?? 0,
      moreWidth: MORE_BUTTON_PX,
      actionsWidth: hasActions ? (widthsRef.current.actions ?? 0) : undefined,
      openInTabWidth: hasOpenInTab
        ? (widthsRef.current.openInTab ?? 0)
        : undefined,
    });
    setPlan((previous) =>
      previous.foldActions === next.foldActions &&
      previous.foldOpenInTab === next.foldOpenInTab &&
      previous.navCompact === next.navCompact
        ? previous
        : next,
    );
  }, [
    headerRef,
    headerSize?.width,
    clusterSize?.width,
    hasActions,
    hasOpenInTab,
    hasNav,
    plan,
    hasTitleTabs,
    titleTabsRef,
    titleTabsSize?.width,
  ]);

  return (
    <header
      aria-label="Peek details"
      ref={headerRef}
      className="flex min-h-10 shrink-0 flex-row flex-nowrap items-center justify-between gap-2 overflow-hidden pt-3 pr-4 pb-1.5 pl-4"
    >
      <div className="flex min-w-0 items-center gap-2">
        {titleTabs && (
          <div ref={titleTabsRef} className="shrink-0">
            <EntityTitleTabs {...titleTabs} />
          </div>
        )}
        <EntityTitle
          as="span"
          type={titleTabs ? undefined : itemType}
          title={title}
          isFocusable
        />
      </div>
      <div
        ref={clusterRef}
        className="flex shrink-0 flex-row items-center gap-1"
      >
        {hasOpenInTab && !plan.foldOpenInTab && openInNewTab ? (
          <div ref={openInTabRef}>
            <Tooltip label="Open in new tab" placement="bottom">
              {({ getTriggerProps }) => (
                <IconButton
                  {...getTriggerProps()}
                  label="Open in new tab"
                  icon={ExternalLink}
                  onClick={openInNewTab}
                />
              )}
            </Tooltip>
          </div>
        ) : null}
        <div
          ref={pinnedRef}
          className="flex h-full flex-row items-center gap-1"
        >
          {expand && (
            <Tooltip
              label={expand.isExpanded ? "Collapse" : "Expand"}
              placement="bottom"
            >
              {({ getTriggerProps }) => (
                <IconButton
                  {...getTriggerProps()}
                  label={expand.isExpanded ? "Collapse" : "Expand"}
                  icon={expand.isExpanded ? Minimize2 : Maximize2}
                  onClick={expand.onToggle}
                />
              )}
            </Tooltip>
          )}
          {detailNavigationKey && resolveDetailNavigationPath && (
            <div ref={navRef} className="flex flex-row items-center">
              <DetailPageNav
                currentId={itemId}
                path={resolveDetailNavigationPath}
                listKey={detailNavigationKey}
                compact
              />
            </div>
          )}
        </div>
        {hasActions && !plan.foldActions ? (
          <div ref={actionsRef} className="flex flex-row items-center gap-1">
            {actions}
          </div>
        ) : null}
        {(plan.foldActions || plan.foldOpenInTab) && (
          <FloatingController
            interaction="click"
            placement="bottom-end"
            open={isMenuOpen}
            onOpenChange={setMenuOpen}
            renderContent={(floatingProps) => (
              <div
                {...floatingProps}
                className="bg-popover text-popover-foreground flex w-auto min-w-44 flex-col gap-0.5 rounded-md border p-1 shadow-md outline-hidden"
              >
                {plan.foldActions && (actionsMenu ?? actions)}
                {plan.foldOpenInTab && openInNewTab && (
                  <Button
                    variant="ghost"
                    text="Open in new tab"
                    icon={ExternalLink}
                    onClick={openInNewTab}
                  />
                )}
              </div>
            )}
          >
            {({ getTriggerProps: getMenuTriggerProps }) => (
              <Tooltip label="More actions" placement="bottom">
                {({ getTriggerProps }) => (
                  <IconButton
                    {...getMenuTriggerProps(getTriggerProps())}
                    label="More actions"
                    icon={MoreHorizontal}
                  />
                )}
              </Tooltip>
            )}
          </FloatingController>
        )}
        <div ref={closeRef}>
          <Tooltip label="Close" placement="bottom">
            {({ getTriggerProps }) => (
              <IconButton
                {...getTriggerProps()}
                label="Close"
                icon={X}
                onClick={onClose}
              />
            )}
          </Tooltip>
        </div>
      </div>
    </header>
  );
}
