import Link from "next/link";
import { type ComponentPropsWithoutRef, type ReactNode, type Ref } from "react";

const PILL_CLASS_NAME =
  "text-muted-foreground inline-flex h-[22px] shrink-0 items-center rounded-sm border px-2 py-0 font-mono text-[11px] leading-none whitespace-nowrap";

type ModernSessionHeaderPillProps = {
  children: ReactNode;
} & (
  | {
      variant: "display";
      title?: string;
    }
  | {
      variant: "link";
      href: ComponentPropsWithoutRef<typeof Link>["href"];
    }
  | ({
      variant: "button";
      ariaLabel: string;
      ref?: Ref<HTMLButtonElement>;
      "data-state"?: string;
    } & Pick<
      ComponentPropsWithoutRef<"button">,
      | "aria-controls"
      | "aria-expanded"
      | "aria-haspopup"
      | "onClick"
      | "onKeyDown"
      | "onPointerDown"
    >)
);

export function ModernSessionHeaderPill(props: ModernSessionHeaderPillProps) {
  if (props.variant === "display") {
    return (
      <span
        title={props.title}
        data-session-header-pill="true"
        className={`${PILL_CLASS_NAME} gap-1.5`}
      >
        {props.children}
      </span>
    );
  }

  if (props.variant === "link") {
    return (
      <Link
        href={props.href}
        data-session-header-pill="true"
        className={`${PILL_CLASS_NAME} hover:border-link hover:text-link group max-w-[280px] min-w-0 gap-1.5`}
      >
        {props.children}
      </Link>
    );
  }

  const { variant, children, ariaLabel, ref, ...interactionProps } = props;
  return (
    <button
      ref={ref}
      {...interactionProps}
      type="button"
      aria-label={ariaLabel}
      data-session-header-pill="true"
      className={`${PILL_CLASS_NAME} hover:bg-accent justify-center`}
    >
      {children}
    </button>
  );
}
