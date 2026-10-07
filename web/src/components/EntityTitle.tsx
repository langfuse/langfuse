import { type ReactNode } from "react";

import {
  ItemTypeTile,
  type LangfuseItemType,
} from "@/src/components/ItemBadge";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import DocPopup, {
  type DocPopupProps,
} from "@/src/components/layouts/doc-popup";
import { cn } from "@/src/utils/tailwind";

type EntityTitleProps = {
  /** Type tile before the title; pages without an entity type omit it. */
  type?: LangfuseItemType;
  /** Plain title; also the native tooltip. */
  title: string;
  /** Renders in place of the title text, e.g. an inline editor. */
  titleContent?: ReactNode;
  /** Explains the title on hover, e.g. why it cannot be renamed. */
  tooltip?: string;
  /** Doc popup right after the title text. */
  help?: DocPopupProps;
  /** Sits right after the title text, e.g. a level badge. */
  trailing?: ReactNode;
  as: "h2" | "span";
  isFocusable?: boolean;
  "data-testid"?: string;
};

/** Tile + title row shared by the page, peek, trace and observation headers. */
export function EntityTitle({
  type,
  title,
  titleContent,
  tooltip,
  help,
  trailing,
  as: Heading,
  isFocusable,
  "data-testid": testId,
}: EntityTitleProps) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      {type && <ItemTypeTile type={type} />}
      <Heading
        className={cn(
          // Explicit colour: titles are the emphasis tier and never inherit a container tint.
          "text-primary min-w-0 truncate pb-1 text-lg leading-6 font-bold",
          isFocusable && "focus:outline-hidden",
        )}
        title={titleContent || tooltip ? undefined : title}
        tabIndex={isFocusable ? 0 : undefined}
        data-testid={testId}
      >
        {titleContent ??
          (tooltip ? (
            <Tooltip label={tooltip} placement="bottom">
              {({ getTriggerProps }) => (
                <span className="cursor-help" {...getTriggerProps()}>
                  {title}
                </span>
              )}
            </Tooltip>
          ) : (
            title
          ))}
        {help && (
          <span className="whitespace-nowrap">
            &nbsp;
            <DocPopup
              description={help.description}
              href={help.href}
              className={help.className}
            />
          </span>
        )}
      </Heading>
      {trailing}
    </div>
  );
}
