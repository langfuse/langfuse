import type { ReactNode } from "react";
import { ChevronRight } from "@langfuse/icons";

import { cn } from "@/src/utils/tailwind";

import styles from "./TileCard.module.css";

type TileCardSize = "sm" | "md";

type TileCardContentProps = {
  size: TileCardSize;
  tile: ReactNode;
  title: ReactNode;
  description: string;
};

type TileCardProps = TileCardContentProps & {
  onClick: () => void;
  /** Call to action shown at the right edge on hover and keyboard focus. */
  actionLabel?: string;
};

const CHROME = "flex w-full items-center border text-left";

const SIZES = {
  sm: {
    chrome: "rounded-lg bg-popover p-3",
    button: styles.sm,
    content: "gap-3",
    text: "",
    title: "text-xs",
    description: "text-xs",
  },
  md: {
    chrome: "rounded-xl bg-card p-4",
    button: cn(
      styles.md,
      "focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2",
    ),
    content: "gap-3.5",
    text: "gap-0.5",
    title: "text-base",
    description: "text-sm",
  },
} satisfies Record<TileCardSize, Record<string, string | undefined>>;

function TileCardContent({
  size,
  tile,
  title,
  description,
}: TileCardContentProps) {
  const classes = SIZES[size];

  return (
    <span className={cn("flex min-w-0 flex-1 items-center", classes.content)}>
      {tile}
      <span className={cn("flex min-w-0 flex-col", classes.text)}>
        <span
          className={cn("flex items-center gap-1.5 font-bold", classes.title)}
        >
          {title}
        </span>
        <span
          className={cn("text-muted-foreground truncate", classes.description)}
          title={description}
        >
          {description}
        </span>
      </span>
    </span>
  );
}

function TileCardButton({
  size,
  tile,
  title,
  description,
  onClick,
  actionLabel,
}: TileCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        CHROME,
        SIZES[size].chrome,
        SIZES[size].button,
        styles.card,
        "cursor-pointer",
      )}
    >
      <TileCardContent
        size={size}
        tile={tile}
        title={title}
        description={description}
      />
      {actionLabel === undefined ? null : (
        <span className={cn("shrink-0", styles.action)}>
          <span className="text-link flex items-center gap-0.5 pl-3.5 text-sm whitespace-nowrap">
            {actionLabel}
            <ChevronRight size="base" color="inherit" aria-hidden />
          </span>
        </span>
      )}
    </button>
  );
}

function TileCardStatic({
  size,
  tile,
  title,
  description,
}: TileCardContentProps) {
  return (
    <div className={cn(CHROME, SIZES[size].chrome)}>
      <TileCardContent
        size={size}
        tile={tile}
        title={title}
        description={description}
      />
    </div>
  );
}

/** `TileCard` is a button; `TileCard.Static` is the same row without an action. */
export const TileCard = Object.assign(TileCardButton, {
  Static: TileCardStatic,
});
