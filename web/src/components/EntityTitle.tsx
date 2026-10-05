import { type ReactNode } from "react";

import {
  ItemTypeTile,
  type LangfuseItemType,
} from "@/src/components/ItemBadge";
import { cn } from "@/src/utils/tailwind";

type EntityTitleProps = {
  /** Type tile before the title; pages without an entity type omit it. */
  type?: LangfuseItemType;
  title: ReactNode;
  /** Native title attribute; omit when the caller renders its own tooltip. */
  titleText?: string;
  /** Sits right after the title text, e.g. a level badge. */
  trailing?: ReactNode;
  as: "h2" | "span";
  isFocusable?: boolean;
};

/** Tile + title row shared by the page, peek, trace and observation headers. */
export function EntityTitle({
  type,
  title,
  titleText,
  trailing,
  as: Heading,
  isFocusable,
}: EntityTitleProps) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      {type && <ItemTypeTile type={type} />}
      <Heading
        className={cn(
          // Explicit colour: titles are the emphasis tier and never inherit a container tint.
          "text-primary min-w-0 truncate text-lg leading-7 font-bold",
          isFocusable && "focus:outline-hidden",
        )}
        title={titleText}
        tabIndex={isFocusable ? 0 : undefined}
      >
        {title}
      </Heading>
      {trailing}
    </div>
  );
}
