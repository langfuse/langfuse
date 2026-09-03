"use client";

import {
  useLayoutEffect,
  useRef,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import { APP_RIGHT_RAIL_WIDTH_VAR } from "@/src/components/layouts/app-layout/right-drawer/rightRailWidth";

/**
 * Marks an in-flow right-hand panel (assistant, support, v4 migration) and
 * publishes its width on `:root` so overlays outside this stacking context
 * can inset themselves. The leftward shadow matches the table peek so the
 * rail lifts off the page content.
 */
export function RightRail({
  children,
  ...props
}: Omit<HTMLAttributes<HTMLDivElement>, "className"> & {
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const publish = () => {
      document.documentElement.style.setProperty(
        APP_RIGHT_RAIL_WIDTH_VAR,
        `${Math.round(el.getBoundingClientRect().width)}px`,
      );
    };

    publish();
    if (typeof ResizeObserver === "undefined") {
      return () => {
        document.documentElement.style.removeProperty(APP_RIGHT_RAIL_WIDTH_VAR);
      };
    }
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty(APP_RIGHT_RAIL_WIDTH_VAR);
    };
  }, []);

  return (
    <div
      {...props}
      ref={ref}
      data-right-rail=""
      data-ignore-outside-interaction
      className="relative h-full min-h-0 border-l shadow-[-12px_0_32px_-16px_hsl(var(--foreground)/0.3)] dark:shadow-[-12px_0_32px_-16px_hsl(var(--background)/0.3)]"
    >
      <div className="h-full min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
