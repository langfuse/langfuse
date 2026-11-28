import { type ComponentProps, useEffect, useRef } from "react";
import { Plus, Settings2, EllipsisVertical } from "@langfuse/icons";
import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Button } from "@/src/components/design-system/Button/Button";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { cn } from "@/src/utils/tailwind";

export function TabBar({
  label,
  tabs,
  createAction,
  manageAction,
  variant = "navigation",
}: {
  variant?: "navigation" | "editor";
  label: string;
  tabs: (Pick<
    ComponentProps<typeof Tabs.Trigger>,
    "value" | "label" | "internal" | "disabled" | "tooltip" | "icon"
  > & {
    value: string;
    label: string;
    noCapture?: boolean;
    onRename?: () => void;
    menu?: {
      label: string;
      items: ComponentProps<typeof DropdownMenu>["items"];
    };
  })[];
  createAction?: {
    label: string;
    onClick: () => void;
    disabledReason?: string;
  };
  manageAction?: { label: string; onClick: () => void };
}) {
  const scrollerRef = useRevealActiveTab();
  return (
    <div
      className={cn(
        "@container/tab-bar flex shrink-0 items-center border-b",
        variant === "navigation" && "px-2",
      )}
    >
      <div ref={scrollerRef} className="min-w-0 overflow-x-auto">
        <Tabs.List variant="underline" divider="none" aria-label={label}>
          {tabs.map(({ menu, noCapture, ...tab }, index) => (
            <div
              key={tab.value}
              className={cn(
                "group/tab relative flex h-full shrink-0 items-center",
                variant === "editor" && menu && "max-w-72",
                noCapture && "ph-no-capture",
              )}
            >
              <Tabs.Trigger
                {...tab}
                flushStart={variant === "editor" && index === 0}
                reserveMenuSpace={variant === "editor" && Boolean(menu)}
              />
              {menu && (
                <DropdownMenu
                  ariaLabel={menu.label}
                  items={menu.items}
                  noCapture={noCapture}
                >
                  {({ getTriggerProps }) => {
                    const triggerProps = getTriggerProps();
                    return (
                      <div
                        className={cn(
                          variant === "editor"
                            ? "absolute inset-y-0 end-1 flex items-center pb-0.5"
                            : "bg-background before:to-background absolute top-1/2 right-1 -translate-y-1/2 rounded-sm before:pointer-events-none before:absolute before:inset-y-0 before:right-full before:w-4 before:bg-linear-to-r before:from-transparent pointer-coarse:static pointer-coarse:-ml-3 pointer-coarse:translate-y-0 pointer-coarse:before:hidden",
                          !triggerProps["aria-expanded"] &&
                            (variant === "editor"
                              ? "pointer-events-none opacity-0 group-hover/tab:pointer-events-auto group-hover/tab:opacity-100 group-has-[:focus-visible]/tab:pointer-events-auto group-has-[:focus-visible]/tab:opacity-100 pointer-coarse:pointer-events-auto pointer-coarse:opacity-100"
                              : "opacity-0 group-focus-within/tab:opacity-100 group-hover/tab:opacity-100 pointer-coarse:opacity-100"),
                        )}
                      >
                        <IconButton
                          icon={EllipsisVertical}
                          label={menu.label}
                          variant={variant === "editor" ? "plain" : "ghost"}
                          size="xsTouch"
                          {...triggerProps}
                        />
                      </div>
                    );
                  }}
                </DropdownMenu>
              )}
            </div>
          ))}
        </Tabs.List>
      </div>
      {createAction && (
        <div
          className={cn(
            "ml-1 shrink-0",
            createAction.disabledReason && "opacity-50",
          )}
        >
          <Tooltip label={createAction.disabledReason ?? createAction.label}>
            {({ getTriggerProps }) => (
              <IconButton
                icon={Plus}
                label={createAction.label}
                size="sm"
                aria-disabled={createAction.disabledReason ? true : undefined}
                {...getTriggerProps({
                  onClick: createAction.disabledReason
                    ? undefined
                    : createAction.onClick,
                })}
              />
            )}
          </Tooltip>
        </div>
      )}
      {manageAction && (
        <div className="flex flex-1 shrink-0 justify-end pl-2">
          <div className="hidden @lg/tab-bar:block">
            <Button
              text={manageAction.label}
              icon={Settings2}
              variant="ghost"
              size="sm"
              onClick={manageAction.onClick}
            />
          </div>
          <div className="@lg/tab-bar:hidden">
            <Tooltip label={manageAction.label}>
              {({ getTriggerProps }) => (
                <IconButton
                  icon={Settings2}
                  label={manageAction.label}
                  size="sm"
                  {...getTriggerProps({ onClick: manageAction.onClick })}
                />
              )}
            </Tooltip>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Scrolls the overflowing tab row so the selected tab and its menu button are
 * visible whenever the selection, the tabs, or the row's size change. Scrolling
 * by hand is left alone until one of those changes.
 */
function useRevealActiveTab() {
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const list = scroller?.querySelector('[role="tablist"]');
    if (!scroller || !list) return;

    const reveal = () => {
      const tab = list.querySelector('[role="tab"][data-state="active"]');
      if (!tab) return;
      const item = (tab.parentElement ?? tab).getBoundingClientRect();
      const bounds = scroller.getBoundingClientRect();
      if (item.left < bounds.left) {
        scroller.scrollLeft -= bounds.left - item.left;
      } else if (item.right > bounds.right) {
        scroller.scrollLeft += item.right - bounds.right;
      }
    };

    reveal();
    // Menu triggers inside the row also toggle data-state, so only tab
    // selection and added or removed tabs count.
    const mutationObserver = new MutationObserver((mutations) => {
      if (
        mutations.some(
          (mutation) =>
            mutation.target === list ||
            (mutation.target instanceof Element &&
              mutation.target.getAttribute("role") === "tab"),
        )
      ) {
        reveal();
      }
    });
    mutationObserver.observe(list, {
      attributes: true,
      attributeFilter: ["data-state"],
      childList: true,
      subtree: true,
    });
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(reveal);
    resizeObserver?.observe(scroller);
    resizeObserver?.observe(list);
    return () => {
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
    };
  }, []);

  return scrollerRef;
}
